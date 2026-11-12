// 无界面测试：node test/sim.mjs [局数]
// 1) 验收脚本：P2「玩家行动让第二天头版出现自己」、P3「身份完整流转一圈」
// 2) 随机打 N 局：不崩、不卡、同种子可复现，并统计胜率与世界事件
import { readFileSync } from 'node:fs';
import { newGame } from '../js/engine/state.js';
import { step } from '../js/engine/day.js';
import { parse, serialize } from '../js/engine/save.js';
import { chipsOf, dealErr, personOf } from '../js/engine/negotiate.js';
import { cardOf } from '../js/engine/cards.js';

const FILES = ['config', 'cards', 'events', 'dilemmas', 'regions', 'industries', 'headlines', 'npcs', 'people', 'world'];
const data = Object.fromEntries(FILES.map(n => [n, JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)))]));
const N = +process.argv[2] || 1000;
const c = data.config;
const assert = (ok, msg) => { if (!ok) throw new Error('验收失败：' + msg); };
const must = (s, a) => {
  const r = step(s, a, data);
  if (r.log[0]?.type === 'error') throw new Error(`动作 ${JSON.stringify(a)} 被拒：${r.log[0].msg}`);
  return r;
};
// 推进到可以花行动点的时刻（事件一律选最后一项：ok / pass）
function toAct(s) {
  for (let g = 0; g < 50 && (s.phase !== 'act' || s.pending); g++) {
    if (s.pending) {
      let r, i = s.pending.opts.length;
      do r = step(s, { type: 'choose', i: --i }, data); while (r.log[0]?.type === 'error' && i > 0);
      s = r.state;
    } else s = must(s, { type: s.phase === 'paper' ? 'start' : 'roll' }).state;
  }
  return s;
}

// ───────── 验收 P2：游说成功 → 第二天头版写着自己，并记入"因你而变"
{
  let s = toAct(newGame(data, 2024, { name: '验收公司', industry: 'tech' }));
  s.player.sites.north = 1; // 夹具：在北岸已有一处厂区
  const a = { type: 'nego', who: 'off_north', deal: 'lobby', chips: ['jobs'] };
  const r1 = must(s, a), r2 = must(s, a);
  const d1 = r1.log.find(l => l.type === 'deal'), d2 = r2.log.find(l => l.type === 'deal');
  assert(d1.ok && d1.v >= c.lobby.lo && d1.v <= c.lobby.hi, '游说应成功且数值在区间内');
  assert(d1.v === d2.v && serialize(r1.state) === serialize(r2.state), '同样的选择必须得到同样的结果');
  const miss = must(s, { ...a, chips: ['cash'] });
  assert(!miss.log.find(l => l.type === 'deal').ok && miss.state.player.cash === s.player.cash, '没命中应谈不成且不扣筹码');
  s = must(r1.state, { type: 'end' }).state;
  assert(s.paper.head.mine && s.paper.head.title.includes('验收公司'), '头版应出现玩家：' + s.paper.head.title);
  assert(s.rewrites.length === 1 && s.rewrites[0].title === s.paper.head.title, '应记入因你而变');
  assert(s.policies.some(x => x.r === 'north'), '政策应生效');
}

// ───────── 验收 P2：反复压丑闻 → 监管越线 → 全行业整改，NPC 跟着倒霉，头版点名
{
  let s = toAct(newGame(data, 7, { name: '验收公司', industry: 'tech' }));
  s.world.industries.tech.regulation = 74; // 夹具：离线不远
  const before = s.npcs.apex.val;
  for (let k = 0; k < 2; k++) {
    s.todo = { t: '数据泄露', lvl: 1, fx: { fame: -5 } };
    s.hand = ['pr_r_1']; s.ap = 3;
    s = must(s, { type: 'play', from: 'hand', i: 0 }).state;
  }
  assert(s.ledger.length === 2 && s.world.industries.tech.regulation >= 80, '压下两次应进暗账并推高监管');
  s = must(s, { type: 'end' }).state;
  assert(s.flags.purge && s.rewrites.some(x => x.k === 'purge'), '应触发全行业整改并归因于玩家');
  assert(s.npcs.apex.val < before * 1.1 && s.world.industries.tech.regulation <= 55, 'NPC 应受损，监管压力应回落');
  assert([s.paper.head, ...s.paper.items].some(x => x.mine && x.title.includes('验收公司')), '报纸应点名玩家');
}

// ───────── 验收 P3：CEO → 上市 → 被罢免成股东 → 股份清零成普通人 → 翻身牌二次创业
{
  const seen = [];
  const run = (s, a) => { const r = must(s, a); for (const l of r.log) if (l.type === 'status') seen.push(l.to); return r.state; };
  let s = toAct(newGame(data, 99, { name: '验收公司', industry: 'tech' }));
  s.player.valBonus = 800; s.player.fame = 30; // 夹具：估值达标、名声偏差
  const fail = must(s, { type: 'nego', who: 'rep', deal: 'ipo', chips: ['cash'] });
  assert(!fail.log.find(l => l.type === 'deal').ok && fail.state.trust === -1, '名声差时一项筹码说服不了股东代表');
  s = run(s, { type: 'nego', who: 'rep', deal: 'ipo', chips: ['cash', 'fame'] });
  assert(s.player.listed && s.player.control === 65 && s.player.cash > 300, '上市：拿钱、稀释');
  s.player.control = 25; // 夹具：几轮融资之后
  s.todo = { t: '高管丑闻', lvl: 3, fx: { cash: -80, fame: -15 } };
  s = run(s, { type: 'end' });
  assert(s.player.status === 'holder' && s.inbox.some(e => e.k === 'vote' && !e.ok), '重大负面事件 → 董事会投票 → 罢免');
  assert(/罢免|出局|变天/.test(s.paper.head.title), '罢免应上头版：' + s.paper.head.title);
  s = toAct(s);
  assert(s.hand.every(id => (cardOf(data, id).when?.status || []).includes('holder')), '被罢免后只抽股东可用的牌');
  assert(step(s, { type: 'sell', r: 'north' }, data).log[0].msg === 'status', '股东不能经营');
  s.ap = 9;
  while (s.player.status === 'holder') s = run(s, { type: 'stake', id: 'self', n: -1 });
  assert(s.player.status === 'out' && s.player.control === 0, '股份清零 → 普通人');
  s = run(s, { type: 'end' });
  s = toAct(s);
  assert(s.hand.length && s.hand.every(id => cardOf(data, id).when?.status?.includes('out')), '普通人只抽翻身牌池');
  s.hand = ['cb_1']; s.player.cash = Math.max(s.player.cash, 100); s.ap = 3;
  s = run(s, { type: 'play', from: 'hand', i: 0, arg: 'pharma' });
  assert(s.player.status === 'ceo' && s.player.control === 100 && s.player.industry === 'pharma' && !s.player.listed, '二次创业');
  assert(seen.join('>') === 'holder>out>ceo', '身份流转一圈：' + seen.join('>'));
}

// ───────── 验收 P3：破产不出局；股东两条路夺回；底牌破产后仍可打
{
  let s = toAct(newGame(data, 5, { name: '验收公司' }));
  s.player.debt = 2000; s.player.cash = 10; s.hole = ['hole_4'];
  s.todo = { t: '专利诉讼', lvl: 1, fx: { cash: -300 } };
  s = must(s, { type: 'end' }).state;
  assert(s.player.status === 'out' && s.phase === 'paper' && s.rewrites.some(x => x.k === 'bust'), '破产 → 普通人，游戏继续');
  s = toAct(s);
  s = must(s, { type: 'play', from: 'hole', i: 0 }).state;
  assert(s.player.status === 'ceo', '底牌东山再起');

  let h = toAct(newGame(data, 6, { name: '验收公司' }));
  h.player.status = 'holder'; h.player.control = 45; h.player.cash = 5000; h.hand = [];
  assert(must(h, { type: 'stake', id: 'self', n: 1 }).state.player.status === 'ceo', '持股过半自动夺回');
  h.player.control = 40;
  assert(must(h, { type: 'nego', who: 'rep', deal: 'retake', chips: ['cash', 'fame'] }).state.player.status === 'ceo', '说服股东代表夺回');
}
console.log('验收 ✓  头版出现玩家 · 世界改写记录 · 确定性谈判 · 身份流转一圈 · 破产与翻身');

// ───────── 随机局
function playGame(seed) {
  let s = newGame(data, seed, { name: '模拟公司', industry: data.industries[seed % 3].id });
  const st = { flips: 0, status: [], deals: 0, dealOk: 0 };
  const act = a => {
    const r = step(s, a, data);
    s = r.state;
    for (const l of r.log) {
      if (l.type === 'flip') st.flips++;
      if (l.type === 'status') st.status.push(l.to);
      if (l.type === 'deal') { st.deals++; st.dealOk += l.ok; }
    }
    return r.log[0]?.type !== 'error';
  };
  const roll = n => (seed * 31 + s.day * 17 + s.ap * 7) % n; // 不占用游戏内随机数
  const nego = (who, deal, arg) => {
    const P = personOf(data, who);
    if (dealErr(s, data, P, deal, arg)) return;
    const mine = chipsOf(s, data).filter(x => x.ok && x.id !== 'fame'), know = mine.filter(x => x.tags.some(t => s.known[who].includes(t)));
    const pickd = (know.length ? know : mine).slice(0, 2).map(x => x.id);
    if (pickd.length) act({ type: 'nego', who, deal, arg, chips: pickd });
  };
  let guard = 0;
  while (s.phase !== 'over') {
    if (++guard > 20000) throw new Error(`stuck seed=${seed} day=${s.day} phase=${s.phase}`);
    if (s.pending) {
      const n = s.pending.opts.length, k = (seed + s.day) % n;
      let ok = false;
      for (let j = 0; j < n && !ok; j++) ok = act({ type: 'choose', i: (k + j) % n });
      if (!ok) throw new Error(`no affordable option seed=${seed} ${s.pending.t}`);
    } else if (s.phase === 'paper') {
      const P = s.paper, lines = [P.head.title, ...P.items.map(x => x.title), ...P.small];
      if (!P.head.title || /[{}]|undefined|NaN/.test(lines.join('|'))) throw new Error('bad paper ' + JSON.stringify(P));
      act({ type: 'start' });
    } else if (s.phase === 'roll') act({ type: 'roll' });
    else if (s.phase === 'act') {
      const p = s.player, k = roll(12); // 每天最多做一件牌以外的事
      if (p.status === 'ceo') {
        if (!p.listed && p.fame > 40) nego('rep', 'ipo');
        if (k === 0) nego(data.people[seed % 3].id, 'lobby');
        else if (k === 1) nego(['x_apex', 'x_kang', 'x_wan'][s.day % 3], 'ally');
        else if (k === 2 && p.cash < 150) nego('rep', 'loan');
        else if (k === 3) act({ type: 'short', id: data.npcs[s.day % 3].id });
        else if (k === 4) act({ type: 'stake', id: data.npcs[s.day % 3].id, n: p.cash > 900 ? 1 : -1 });
        else if (k === 5) nego('rep', 'merge', data.npcs[s.day % 3].id);
      } else if (p.status === 'holder') {
        if (k < 4) nego('rep', 'retake');
        else if (k < 8) act({ type: 'stake', id: 'self', n: seed % 4 ? 1 : -1 });
      }
      if (k === 6) nego('fixer', 'intel');
      for (const from of ['hole', 'hand'])
        for (let i = s[from].length - 1; i >= 0; i--) {
          const fx = cardOf(data, s[from][i])?.fx || {};
          if (seed % 4 && fx.control < 0 && s.player.control + fx.control < 51) continue; // 四分之三的机器人会守住控制权
          act({ type: 'play', from, i, arg: data.regions[(seed + i) % 3].id }) || act({ type: 'play', from, i, arg: 'ops' });
        }
      while (s.hand.length > c.handMax) act({ type: 'discard', i: 0 });
      if (s.day === 30) s = parse(serialize(s)); // 存档往返
      act({ type: 'end' });
    }
    const p = s.player;
    for (const k of ['cash', 'fame', 'control', 'debt']) if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`bad ${k}=${p[k]} seed=${seed} day=${s.day}`);
    for (const n of Object.values(s.npcs)) if (!Number.isFinite(n.val + n.cash + n.debt)) throw new Error(`bad npc seed=${seed}`);
  }
  return { s, st };
}

const t0 = Date.now();
const sum = { fame: 0, worth: 0, wins: 0, flips: 0, days: 0, rew: 0, deals: 0, dealOk: 0, top: 0 }, ev = {}, sta = {};
for (let i = 1; i <= N; i++) {
  const { s, st } = playGame(i * 7919);
  sum.worth += s.result.worth; sum.fame += s.player.fame; sum.wins += s.result.win; sum.flips += st.flips; sum.days += s.day; sum.rew += s.rewrites.length;
  sum.deals += st.deals; sum.dealOk += st.dealOk; sum.top += Math.max(0, ...s.result.npcs.map(n => n.worth));
  for (const r of s.rewrites) ev[r.k] = (ev[r.k] || 0) + 1;
  for (const k of new Set(st.status)) sta[k] = (sta[k] || 0) + 1;
  if (st.status.join('>').includes('holder>out>ceo')) sta.loop = (sta.loop || 0) + 1;
}
const a = serialize(playGame(42).s), b = serialize(playGame(42).s);
if (a !== b) throw new Error('同种子结果不一致');
const avg = k => Math.round(sum[k] / N), pct = n => ((100 * (n || 0)) / N).toFixed(1) + '%';
console.log(`${N} 局 OK  ${Date.now() - t0}ms  同种子可复现 ✓`);
console.log(`平均身价 ${avg('worth')}  最强 NPC ${avg('top')}  胜率 ${pct(sum.wins)}  平均 ${(sum.days / N).toFixed(1)} 天  终局名声 ${avg('fame')}`);
console.log(`每局：因你而变 ${(sum.rew / N).toFixed(1)} 条  谈判 ${(sum.deals / N).toFixed(1)} 次（成 ${(sum.dealOk / N).toFixed(1)}）  暗账翻出 ${(sum.flips / N).toFixed(1)} 次`);
console.log(`经历过：被罢免 ${pct(sta.holder)}  沦为普通人 ${pct(sta.out)}  重回 CEO ${pct(sta.ceo)}  完整一圈 ${pct(sta.loop)}`);
console.log('世界改写：' + Object.entries(ev).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${(n / N).toFixed(2)}`).join('  '));
