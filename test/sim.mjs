// 无界面测试：node test/sim.mjs [每种打法的局数，默认 1000]
// 1) 内容清点：数量对齐方案书第 14 节，引用都接得上
// 2) 验收脚本：P2「头版出现自己」、P3「身份流转一圈」、P4「倾向剧本、灰色牌、做空回补、结算数据」
// 3) 三种打法各跑 N 局：不崩、不卡、同种子可复现，统计胜率、局长和内容覆盖
import { readFileSync } from 'node:fs';
import { newGame, VERSION } from '../js/engine/state.js';
import { step } from '../js/engine/day.js';
import { parse, serialize } from '../js/engine/save.js';
import { chipsOf, dealErr, needOf, personOf } from '../js/engine/negotiate.js';
import { cardOf, lvlOf, statusOk } from '../js/engine/cards.js';
import { income, npcWorth, stocks, valuation } from '../js/engine/company.js';

const FILES = ['config', 'cards', 'events', 'dilemmas', 'regions', 'industries', 'headlines', 'npcs', 'people', 'world'];
const data = Object.fromEntries(FILES.map(n => [n, JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)))]));
const N = +process.argv[2] || 1000;
const c = data.config;
// 试数值不用改文件：CFG='{"npc.grow":14,"win":9000}' node test/sim.mjs 300
for (const [k, v] of Object.entries(JSON.parse(process.env.CFG || '{}'))) k.split('.').reduce((o, key, i, a) => (i < a.length - 1 ? o[key] : (o[key] = v)), c);
const assert = (ok, msg) => { if (!ok) throw new Error('验收失败：' + msg); };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// 记下报纸用过哪些模板、有没有找不到的模板
const H0 = data.headlines, used = new Set(), missing = new Set();
data.headlines = new Proxy(H0, { get(t, k) { if (typeof k === 'string') (k in t ? used : missing).add(k); return t[k]; } });

// ───────── 内容清点
{
  const E = data.events, C = data.cards, main = C.filter(x => !x.when?.flag && x.when?.listed == null && x.type !== 'wild' && (x.when?.status || ['ceo']).includes('ceo'));
  const n = {
    通用牌: main.filter(x => x.type !== 'hole' && !x.when?.industry).length, 底牌: C.filter(x => x.type === 'hole').length,
    通用事件: E.gen.length, 抉择: data.dilemmas.length, 宏观: E.macro.length, 世界事件: data.world.length, 谈判对象: data.people.length,
  };
  const want = { 通用牌: 18, 底牌: 6, 通用事件: 20, 抉择: 12, 宏观: 10, 世界事件: 12, 谈判对象: 8 };
  for (const k in want) assert(n[k] === want[k], `${k} 应为 ${want[k]}，现有 ${n[k]}`);
  for (const i of data.industries) {
    assert(C.filter(x => x.when?.industry?.includes(i.id)).length === 12, i.name + ' 行业牌应为 12 张');
    assert(E.ind[i.id].length === 8, i.name + ' 行业事件应为 8 个');
  }
  const ids = [...C, ...E.gen, ...Object.values(E.ind).flat(), ...E.lean, ...E.life, ...E.macro, ...data.dilemmas, ...data.world, ...data.people].map(x => x.id);
  assert(new Set(ids).size === ids.length, 'id 重复：' + ids.filter((x, i) => ids.indexOf(x) !== i));
  // 效果词都在引擎认识的词汇里，引用的地区和行业都存在
  const FX = ['cash', 'fame', 'control', 'debt', 'val', 'inc', 'ap', 'draw', 'shield', 'site', 'reveal', 'boom', 'reg', 'stab', 'acc', 'suppress', 'resolve', 'restart', 'favor'];
  const ind = data.industries.map(x => x.id), reg = data.regions.map(x => x.id);
  const checkFx = (fx, at) => {
    for (const k in fx || {}) assert(FX.includes(k), `${at} 用了不认识的效果 ${k}`);
    for (const [m, ok] of [['boom', ind], ['reg', ind], ['stab', reg], ['acc', reg]])
      for (const k in fx?.[m] || {}) assert(k[0] === '$' || ok.includes(k), `${at} 的 ${m} 指向不存在的 ${k}`);
  };
  for (const x of C) { checkFx(x.fx, x.id); checkFx(x.ledger?.fx, x.id); assert(!x.news || H0[x.news], x.id + ' 的报纸模板不存在'); }
  for (const e of [...E.gen, ...Object.values(E.ind).flat(), ...E.lean, ...E.life, ...E.macro, ...data.dilemmas]) {
    checkFx(e.fx, e.id);
    for (const o of e.opts || []) { checkFx(o.fx, e.id); checkFx(o.ledger?.fx, e.id); }
    assert(e.opts || e.fx, e.id + ' 既没有选项也没有效果');
  }
  for (const w of data.world) { checkFx(w.fx, w.id); checkFx(w.hit, w.id); assert(H0[w.id], w.id + ' 缺报纸模板'); }
  for (const x of Object.values(c.chips)) checkFx(x.fx, 'chips');
  const tpl = Object.entries(H0).filter(([, v]) => Array.isArray(v));
  for (const [k, v] of tpl) assert(v.length >= 3, `报纸模板 ${k} 至少要 3 种写法`);
  const total = tpl.reduce((a, [, v]) => a + v.length, 0) + sum(Object.fromEntries(Object.entries(H0.after).map(([k, v]) => [k, v.length])));
  console.log(`内容 ✓  主牌池 ${n.通用牌 + n.底牌 + 36}（行业 12×3 · 通用 ${n.通用牌} · 底牌 ${n.底牌}）+ 身份与解锁牌 ${C.length - n.通用牌 - n.底牌 - 36}  ` +
    `事件 ${n.通用事件}+${8 * 3}+${n.抉择}+${n.宏观}  倾向剧本 ${E.lean.length}  世界事件 ${n.世界事件}  报纸模板 ${total} 条  谈判对象 ${n.谈判对象}`);
}

const must = (s, a) => {
  const r = step(s, a, data);
  if (r.log[0]?.type === 'error') throw new Error(`动作 ${JSON.stringify(a)} 被拒：${r.log[0].msg}`);
  return r;
};
// 推进到可以花行动点的时刻（事件一律选最后一项：ok / pass）
function toAct(s) {
  for (let g = 0; g < 50 && s.phase !== 'over' && (s.phase !== 'act' || s.pending); g++) {
    if (s.pending) {
      let r, i = s.pending.opts.length;
      do r = step(s, { type: 'choose', i: --i }, data); while (r.log[0]?.type === 'error' && i > 0);
      s = r.state;
    } else s = must(s, { type: s.phase === 'paper' ? 'start' : 'roll' }).state;
  }
  return s;
}
// 什么都不做地过完这一天（手牌超了就弃）
function pass(s) {
  s = toAct(s);
  while (s.hand.length > c.handMax) s = must(s, { type: 'discard', i: 0 }).state;
  return s.phase === 'act' ? must(s, { type: 'end' }).state : s;
}

// ───────── 验收 P2：游说成功 → 第二天头版写着自己，并记入"因你而变"
{
  let s = toAct(newGame(data, 2024, { name: '验收公司', industry: 'tech' }));
  s.player.sites.north = 1; s.todo = null; // 夹具：在北岸已有一处厂区
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
  s.player.valBonus = 800; s.player.fame = 30; s.todo = null; // 夹具：估值达标、名声偏差
  const fail = must(s, { type: 'nego', who: 'rep', deal: 'ipo', chips: ['cash'] });
  assert(!fail.log.find(l => l.type === 'deal').ok && fail.state.trust === -1, '名声差时一项筹码说服不了股东代表');
  s = run(s, { type: 'nego', who: 'rep', deal: 'ipo', chips: ['cash', 'fame'] });
  assert(s.player.listed && s.player.control === Math.round(100 * c.ipo.keep) && s.player.cash > 300, '上市：拿钱、稀释');
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
  assert(s.path.map(x => x[0]).join('>') === 'ceo>holder>out>ceo', '身份轨迹应记进存档');
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
  h.player.status = 'holder'; h.player.control = 45; h.player.cash = 5000; h.hand = []; h.todo = null;
  assert(must(h, { type: 'stake', id: 'self', n: 1 }).state.player.status === 'ceo', '持股过半自动夺回');
  h.player.control = 40;
  assert(must(h, { type: 'nego', who: 'rep', deal: 'retake', chips: ['cash', 'fame'] }).state.player.status === 'ceo', '说服股东代表夺回');
}

// ───────── 验收 P4：抉择留下的倾向会找上门；灰色牌进暗账不见报；做空没等来利空会被填平；旧存档不误读
{
  let s = newGame(data, 11, { name: '验收公司', industry: 'tech' });
  s.player.lean = { clean: 2 }; // 夹具：两次都选了干净的那条路
  for (let g = 0; g < 60 && !s.seen.x_clean && s.phase !== 'over'; g++) s = pass(s);
  assert(s.seen.x_clean && !s.seen.x_gray && s.player.shield >= s.seen.x_clean, '倾向剧本应按倾向出场：' + JSON.stringify(s.seen));

  let g = toAct(newGame(data, 3, { name: '验收公司', industry: 'tech' }));
  g.hand = ['tech_r_2']; g.ap = 3; g.todo = null;
  g = must(g, { type: 'play', from: 'hand', i: 0 }).state;
  assert(g.ledger.length === 1 && g.ledger[0].t === '带病上线' && g.player.valBonus === 90 && !g.news.length, '灰色牌：好处到手，暗账记下，不见报');

  let k = toAct(newGame(data, 8, { name: '验收公司', industry: 'tech' }));
  k.player.cash = 500; k.todo = null; k.npcs.kang.listed = true;
  const v0 = k.npcs.kang.val;
  k = must(k, { type: 'short', id: 'kang' }).state;
  assert(k.shorts[0].dip === v0 - k.npcs.kang.val && k.shorts[0].dip > 0, '做空先砸出一个坑');
  for (let d = 0; d <= c.short.days && k.shorts.length; d++) k = pass(k);
  assert(!k.shorts.length && (k.rewrites.some(x => x.k === 'short') || k.npcs.kang.val > v0 * (1 - c.short.push)), '空单到期：要么得手，要么坑被填平');

  let old = null;
  try { old = parse(JSON.stringify({ ...newGame(data, 1), v: VERSION - 1 })); } catch {}
  assert(!old, '旧版本存档应被拒绝');

  const q = must(toAct(newGame(data, 2, { name: '验收公司' })), { type: 'quit' }).state; // 只有主动放弃才算输
  assert(q.phase === 'over' && q.result.quit && !q.result.win && q.result.title && q.result.none, '放弃 → 终刊：有标题，也有一句「世界没有察觉」');
}
console.log('验收 ✓  头版出现玩家 · 世界改写记录 · 确定性谈判 · 身份流转一圈 · 破产与翻身 · 倾向剧本 · 灰色牌 · 做空回补');

// ───────── 三种打法
// rand  乱打：能出的牌全出，什么都碰一下（压力测试，不讲道理）
// plain 普通玩家：会处理危机、会建厂、守住控制权；不细读小字栏，不碰股票，对暗账心存侥幸
// sharp 老练玩家：读报避险、结盟、买股、等利空才做空，算过暗账翻出的期望
const BOTS = {
  rand: { name: '乱打' },
  plain: { name: '普通', reserve: 30, floor: 51, ipoAt: 78 },
  sharp: { name: '老练', reserve: 60, floor: 51, ipoAt: 78, reads: true },
};
// 估算局长用的手速（秒）：读报、掷骰看事件、做选择、出牌、谈判……
const SECS = { start: 9, roll: 4, choose: 5, play: 5, nego: 12, stake: 4, short: 5, sell: 4, discard: 2, end: 2 };

// 一组效果对玩家值多少（粗估，折成现金）
function worthOf(s, fx = {}) {
  const p = s.player, left = c.days - s.day, ctl = p.status === 'out' ? 0 : p.control / 100;
  const [lo, hi] = c.fame.income, fame = 4 + (Math.max(0, income(s, data)) * (hi - lo) * left * 0.6) / 100; // 一点名声 ≈ 之后多赚的钱
  return (fx.cash || 0) - (fx.debt || 0) + (fx.val || 0) * ctl + (fx.fame || 0) * fame
    + ((fx.control || 0) * valuation(s, data)) / 100 + (fx.inc || 0) * left * 0.9
    + (fx.site || 0) * (c.site.value * ctl + c.site.income * left * 0.9)
    + (fx.shield ? 20 : 0) + (fx.draw || 0) * 25 + (fx.ap || 0) * 45 + (fx.reveal || 0) * 8;
}
// 暗账的代价：老练的人按「翻出概率 × 加倍」算；普通人只当它一半，被翻出两次才学乖
const ledgerCost = (s, L, B) => (!L ? 0 : -worthOf(s, L.fx) * (B.reads || s.player.n.flips >= 2 ? c.ledger.mult * (1 - (1 - c.ledger.flip) ** (c.days - s.day)) : 0.5));
const printed = (s, k, key, v) => s.queue.some(q => q.k === k && q.said && q[key] === v); // 小字栏登过的前兆
const sites = s => sum(s.player.sites);
function bestRegion(s, B) {
  const p = s.player, cap = s.flags.antitrust || B.reads ? 5 : 6;
  if (sites(s) >= cap) return null;
  const ok = data.regions.filter(r => s.world.regions[r.id].ban < s.day && !(B.reads && printed(s, 'pol', 'r', r.id)));
  const score = r => s.world.regions[r.id].acceptance * (s.world.regions[r.id].industry === p.industry ? c.site.match : 1) + p.sites[r.id] * 3;
  return ok.sort((a, b) => score(b) - score(a))[0]?.id || null;
}

function playGame(seed, kind) {
  const B = BOTS[kind];
  let s = newGame(data, seed, { name: '模拟公司', industry: data.industries[seed % 3].id });
  const st = { flips: 0, blown: 0, status: [], deals: 0, dealOk: 0, secs: 0, drawn: new Set(), played: new Set() };
  const act = a => {
    const r = step(s, a, data);
    if (r.log[0]?.type === 'error') return false;
    s = r.state;
    st.secs += SECS[a.type] || 0;
    for (const l of r.log) {
      if (l.type === 'flip') st.flips++;
      if (l.type === 'status') st.status.push(l.to);
      if (l.type === 'deal') { st.deals++; st.dealOk += l.ok; }
      if (l.type === 'draw') st.drawn.add(l.id);
      if (l.type === 'play') st.played.add(l.id);
    }
    return true;
  };

  // 谈判：先摆已知对方在意的筹码，再按便宜的凑数
  const nego = (who, deal, arg, extra) => {
    const P = personOf(data, who), p = s.player;
    if (!P || s.ap < 1 || dealErr(s, data, P, deal, arg)) return false;
    const need = needOf(s, data, P, deal, arg), known = s.known[who];
    const pool = chipsOf(s, data).filter(x => x.ok && (x.id !== 'equity' || p.control > 70) && (x.id !== 'fame' || p.fame > 30 || deal === 'retake'))
      .map(x => ({ x, hit: x.tags.some(t => known.includes(t)), cost: x.i != null ? 50 : -worthOf(s, x.fx) }))
      .sort((a, b) => b.hit - a.hit || a.cost - b.cost);
    const n = Math.min(2, need + (extra && pool.filter(q => q.hit).length > need ? 1 : 0));
    const chips = pool.slice(0, n).map(q => q.x.id);
    return chips.length >= need && act({ type: 'nego', who, deal, arg, chips });
  };

  function choose() {
    const pe = s.pending, p = s.player, n = pe.opts.length;
    if (kind === 'rand' || n === 1) {
      const k = (seed + s.day) % n;
      for (let j = 0; j < n; j++) if (act({ type: 'choose', i: (k + j) % n })) return;
      throw new Error(`no affordable option seed=${seed} ${pe.t}`);
    }
    let order;
    if (pe.k === 'region') {
      const want = bestRegion(s, B) && p.cash - c.site.cost >= B.reserve + 40 && s.day < c.days - 6;
      order = pe.opts.map((o, i) => [i, o.l === 'build' ? (want ? 2 : -1) : o.l === 'pass' ? 1 : 0]);
    } else if (pe.k === 'favor') order = [[0, p.cash >= c.favor.cash + 80 ? 1 : -1], [1, 0]];
    else order = pe.opts.map((o, i) => [i, worthOf(s, o.fx) - ledgerCost(s, o.ledger, B)]);
    for (const [i] of order.sort((a, b) => b[1] - a[1])) if (act({ type: 'choose', i })) return;
    throw new Error(`no affordable option seed=${seed} ${pe.t}`);
  }

  // 一张牌现在值不值得打：返回 { v, arg }，不打返回 null
  function cardValue(card, from) {
    const p = s.player, fx = card.fx || {};
    if (card.type === 'wild') return { v: 30, arg: s.todo ? 'pr' : p.cash < 60 ? 'fin' : 'ops' };
    if (!statusOk(card, p.status) || fx.suppress || fx.resolve) return null; // 公关牌留给危机
    if (fx.restart) return p.status === 'out' && p.cash >= -(fx.cash || 0) ? { v: 999, arg: data.industries.slice().sort((a, b) => s.world.industries[b.id].boom - s.world.industries[a.id].boom)[0].id } : null;
    if (s.ap < (from === 'hole' ? 0 : 1)) return null;
    if (fx.cash < 0 && p.cash + fx.cash < B.reserve) return null;
    if (fx.control < 0 && (p.control + fx.control < B.floor || p.cash > 250)) return null; // 不缺钱就不稀释
    if (fx.debt > 0 && p.cash > 60) return null;
    let arg;
    if (fx.site) { arg = bestRegion(s, B); if (!arg || s.day > c.days - 6) return null; }
    if (from === 'hole') { // 底牌留到用得上的时候
      if (fx.cash > 0 && p.cash > 80) return null;
      if (fx.debt < 0 && p.debt < 150) return null;
      if (fx.control > 0 && p.status === 'ceo' && p.control >= 50) return null;
    }
    let v = worthOf(s, fx) - ledgerCost(s, card.ledger, B) - (fx.favor ? c.favor.cash * 0.7 : 0);
    if (B.reads && fx.shield && p.shield < s.day && printed(s, 'reg', 'i', p.industry)) v += c.reg.fine;
    return v > 0 ? { v, arg } : null;
  }

  function crisis() {
    const p = s.player, T = s.todo, loss = -worthOf(s, T.fx) + (T.lvl >= 2 && (p.listed || p.control < c.vote.risk) ? 80 : 0);
    let best = null;
    for (const from of ['hand', 'hole']) s[from].forEach((id, i) => {
      const k = cardOf(data, id), fx = k.fx || {};
      if (!(fx.suppress || fx.resolve) || lvlOf(k) < T.lvl || !statusOk(k, p.status) || (fx.cash < 0 && p.cash < -fx.cash)) return;
      const cost = -worthOf(s, fx) + (fx.suppress ? ledgerCost(s, T, B) + 10 : 0) + (fx.favor ? c.favor.cash * 0.7 : 0) + (from === 'hole' ? 40 : 0);
      if (cost < loss && (!best || cost < best.cost)) best = { from, i, cost };
    });
    if (best) act({ type: 'play', from: best.from, i: best.i });
    else { const w = s.hand.findIndex(id => cardOf(data, id).type === 'wild'); if (w >= 0 && act({ type: 'play', from: 'hand', i: w, arg: 'pr' })) crisis(); }
  }

  function smartDay() {
    const p = s.player;
    if (s.todo && s.ap > 0) crisis();
    const bad = new Set();
    for (let g = 0; g < 14; g++) { // 每次挑最值的一张打
      let best = null;
      for (const from of ['hole', 'hand']) s[from].forEach((id, i) => {
        if (bad.has(id)) return;
        const r = cardValue(cardOf(data, id), from);
        if (r && (!best || r.v > best.v)) best = { ...r, from, i, id };
      });
      if (!best) break;
      if (!act({ type: 'play', from: best.from, i: best.i, arg: best.arg })) bad.add(best.id);
    }
    if (p.status === 'ceo') {
      if (!p.listed && p.control >= B.ipoAt) nego('rep', 'ipo');
      if (p.cash < 80 && p.debt < 600) nego('rep', 'loan');
      const r = data.regions.filter(x => p.sites[x.id]).sort((a, b) => p.sites[b.id] - p.sites[a.id])[0];
      if (r) nego('off_' + r.id, 'lobby', undefined, B.reads);
      if (s.flags.antitrust && sites(s) >= 6) act({ type: 'sell', r: data.regions.filter(x => p.sites[x.id]).sort((a, b) => s.world.regions[a.id].acceptance - s.world.regions[b.id].acceptance)[0].id });
    } else if (p.status === 'holder') {
      nego('rep', 'retake');
      while (s.player.status === 'holder' && s.ap > 0 && act({ type: 'stake', id: 'self', n: 1 }));
    }
    if (!B.reads) return;
    for (const d of data.npcs) { // 老练的几手：等利空做空、结盟、买股
      const n = s.npcs[d.id];
      if (!n.alive || s.ap < 1) continue;
      if (d.industry !== s.player.industry && printed(s, 'reg', 'i', d.industry) && s.player.cash >= c.short.size + 150) act({ type: 'short', id: d.id });
      if (s.player.status === 'ceo' && income(s, data) >= 50 && s.player.cash >= 200) nego(data.people.find(x => x.npc === d.id).id, 'ally', undefined, true);
    }
    const buy = data.npcs.filter(d => s.npcs[d.id].alive && s.player.stake[d.id] < c.stock.max).sort((a, b) => s.player.stake[a.id] - s.player.stake[b.id])[0];
    while (buy && s.ap > 0 && s.day < c.days - 3 && s.player.cash >= 350 + (npcWorth(s, data, buy.id) * c.stock.step) / 100 && act({ type: 'stake', id: buy.id, n: 1 }));
  }

  function randDay() {
    const p = s.player, k = (seed * 31 + s.day * 17 + s.ap * 7) % 12, rn = (who, deal, arg) => {
      const P = personOf(data, who);
      if (dealErr(s, data, P, deal, arg)) return;
      const mine = chipsOf(s, data).filter(x => x.ok && x.id !== 'fame'), know = mine.filter(x => x.tags.some(t => s.known[who].includes(t)));
      const pickd = (know.length ? know : mine).slice(0, 2).map(x => x.id);
      if (pickd.length) act({ type: 'nego', who, deal, arg, chips: pickd });
    };
    if (p.status === 'ceo') {
      if (!p.listed && p.fame > 40) rn('rep', 'ipo');
      if (k === 0) rn(data.people[seed % 3].id, 'lobby');
      else if (k === 1) rn(['x_apex', 'x_kang', 'x_wan'][s.day % 3], 'ally');
      else if (k === 2 && p.cash < 150) rn('rep', 'loan');
      else if (k === 3) act({ type: 'short', id: data.npcs[s.day % 3].id });
      else if (k === 4) act({ type: 'stake', id: data.npcs[s.day % 3].id, n: p.cash > 900 ? 1 : -1 });
      else if (k === 5) rn('rep', 'merge', data.npcs[s.day % 3].id);
    } else if (p.status === 'holder') {
      if (k < 4) rn('rep', 'retake');
      else if (k < 8) act({ type: 'stake', id: 'self', n: seed % 3 ? 1 : -1 });
    }
    if (k === 6) rn('fixer', 'intel');
    for (const from of ['hole', 'hand'])
      for (let i = s[from].length - 1; i >= 0; i--) {
        const fx = cardOf(data, s[from][i])?.fx || {};
        if (seed % 4 && fx.control < 0 && s.player.control + fx.control < 51) continue;
        act({ type: 'play', from, i, arg: data.regions[(seed + i) % 3].id }) || act({ type: 'play', from, i, arg: 'ops' });
      }
  }

  let guard = 0;
  while (s.phase !== 'over') {
    if (++guard > 20000) throw new Error(`stuck seed=${seed} day=${s.day} phase=${s.phase}`);
    if (s.pending) choose();
    else if (s.phase === 'paper') {
      const P = s.paper, lines = [P.head.title, ...P.items.map(x => x.title), ...P.small];
      if (!P.head.title || lines.some(t => !t || /[{}]|undefined|NaN|：$|「」/.test(t))) throw new Error('bad paper ' + JSON.stringify(P));
      act({ type: 'start' });
    } else if (s.phase === 'roll') act({ type: 'roll' });
    else if (s.phase === 'act') {
      kind === 'rand' ? randDay() : smartDay();
      while (s.hand.length > c.handMax) { // 弃掉最不值的
        const vs = s.hand.map(id => cardValue(cardOf(data, id), 'hand')?.v ?? (cardOf(data, id).fx?.resolve || cardOf(data, id).fx?.suppress ? 40 : -1));
        act({ type: 'discard', i: kind === 'rand' ? 0 : vs.indexOf(Math.min(...vs)) });
      }
      if (s.day === 30) s = parse(serialize(s)); // 存档往返
      if (s.todo) st.blown++;
      act({ type: 'end' });
    }
    const p = s.player;
    for (const k of ['cash', 'fame', 'control', 'debt']) if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`bad ${k}=${p[k]} seed=${seed} day=${s.day}`);
    for (const n of Object.values(s.npcs)) if (!Number.isFinite(n.val + n.cash + n.debt)) throw new Error(`bad npc seed=${seed}`);
  }
  const r = s.result;
  if (!r.title || /[{}]/.test(r.title) || s.path[0][0] !== 'ceo' || !(s.peak[0] > 0)) throw new Error('bad result seed=' + seed);
  return { s, st };
}

const t0 = Date.now(), cover = { drawn: new Set(), played: new Set(), ev: new Set(), world: new Set() }, rate = {};
console.log(`\n每种打法 ${N} 局          胜率   提前胜  平均身价  最强NPC  估算局长  因你而变  暗账翻出  谈判(成)   被罢免   破产   终局名声`);
const KINDS = (process.env.BOT || Object.keys(BOTS).join()).split(','); // 只跑一种：BOT=plain
for (const kind of KINDS) {
  const t = { worth: 0, top: 0, wins: 0, early: 0, secs: 0, rew: 0, flips: 0, blown: 0, deals: 0, dealOk: 0, fame: 0, cash: 0, co: 0, stock: 0, debt: 0, inc: 0, sites: 0, ctl: 0, day: 0 }, sta = {}, ev = {};
  for (let i = 1; i <= N; i++) {
    const { s, st } = playGame(i * 7919, kind), r = s.result;
    t.worth += r.worth; t.top += Math.max(0, ...r.npcs.map(n => n.worth)); t.wins += r.win; t.early += r.win && r.day < c.days;
    t.cash += s.player.cash; t.co += (s.player.control / 100) * valuation(s, data); t.stock += stocks(s, data); t.debt += s.player.debt; t.inc += income(s, data); t.sites += sites(s); t.ctl += s.player.control; t.day += r.day;
    t.secs += st.secs; t.rew += s.rewrites.length; t.flips += st.flips; t.blown += st.blown; t.deals += st.deals; t.dealOk += st.dealOk; t.fame += s.player.fame;
    for (const k of new Set(st.status)) sta[k] = (sta[k] || 0) + 1;
    if (s.player.n.busts) sta.bust = (sta.bust || 0) + 1;
    for (const x of s.rewrites) ev[x.k] = (ev[x.k] || 0) + 1;
    for (const id of st.drawn) cover.drawn.add(id);
    for (const id of st.played) cover.played.add(id);
    for (const id in s.seen) cover.ev.add(id);
    for (const id in s.flags) cover.world.add(id);
  }
  const a = (k, d = 0) => (t[k] / N).toFixed(d), pct = n => ((100 * (n || 0)) / N).toFixed(1) + '%';
  rate[kind] = (100 * t.wins) / N;
  console.log(`${BOTS[kind].name} ${kind.padEnd(6)}`.padEnd(22) + [pct(t.wins), pct(t.early), a('worth'), a('top'), (t.secs / N / 60).toFixed(0) + ' 分钟', a('rew', 1), a('flips', 1),
    `${a('deals', 1)}(${a('dealOk', 1)})`, pct(sta.holder), pct(sta.bust), a('fame')].map(x => String(x).padStart(8)).join(' '));
  console.log(`   身价构成：现金 ${a('cash')} + 公司 ${a('co')}（持股 ${a('ctl')}%）+ 股票 ${a('stock')} − 债务 ${a('debt')}   终局日入 ${a('inc')}  厂区 ${a('sites', 1)}  爆掉的危机 ${a('blown', 1)}  平均 ${a('day', 1)} 天`);
  console.log('   世界改写：' + Object.entries(ev).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${(n / N).toFixed(2)}`).join('  '));
}
const a = serialize(playGame(42, 'plain').s), b = serialize(playGame(42, 'plain').s);
if (a !== b) throw new Error('同种子结果不一致');

// ───────── 覆盖：每张牌、每个事件、每条模板、每个世界事件都真的出现过
const E = data.events, evs = [...E.gen, ...Object.values(E.ind).flat(), ...E.lean, ...E.life, ...E.macro, ...data.dilemmas];
const lack = {
  没抽到的牌: data.cards.filter(x => !cover.drawn.has(x.id)).map(x => x.name), 没打出的牌: data.cards.filter(x => x.type !== 'wild' && !cover.played.has(x.id)).map(x => x.name),
  没出现的事件: evs.filter(x => !cover.ev.has(x.id)).map(x => x.t), 没触发的世界事件: data.world.filter(x => !cover.world.has(x.id)).map(x => x.id),
  没用到的模板: Object.keys(H0).filter(k => !used.has(k)), 找不到的模板: [...missing].filter(k => !k.endsWith('_me')),
};
console.log(`\n${N * KINDS.length} 局 OK  ${((Date.now() - t0) / 1000).toFixed(0)}s  同种子可复现 ✓`);
console.log(`覆盖  牌 ${cover.drawn.size}/${data.cards.length}  事件 ${evs.length - lack.没出现的事件.length}/${evs.length}  世界事件 ${data.world.length - lack.没触发的世界事件.length}/${data.world.length}`);
if (N >= 300) for (const [k, v] of Object.entries(lack)) if (v.length) console.log(`  ⚠ ${k}：${v.join('、')}`); // 局数太少时，翻身牌池常常没人走到
if (lack.找不到的模板.length) throw new Error('报纸用了不存在的模板');
if (N >= 1000 && rate.plain != null) { // 方案书 P4 验收：普通打法胜率 30%–50%
  assert(rate.plain >= 30 && rate.plain <= 50, `普通打法胜率 ${rate.plain.toFixed(1)}% 不在 30%–50%`);
  console.log(`平衡 ✓  普通打法胜率 ${rate.plain.toFixed(1)}%，落在 30%–50%`);
}
