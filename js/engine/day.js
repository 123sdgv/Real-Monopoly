// 一天的流程。step(状态, 动作, 数据) → { state: 新状态, log: 发生了什么 }，不碰 DOM。
import { chance, int } from './rng.js';
import { cardOf, draw, play, statusOk } from './cards.js';
import { land, night, resolve } from './events.js';
import { applyFx, settle, watch } from './world.js';
import { harm, income, netWorth, npcWorth, seat, vote } from './company.js';
import { npcNight, short, trade } from './npc.js';
import { negotiate } from './negotiate.js';
import { makePaper } from './paper.js';
import { fill } from './news.js';

export function step(prev, a, data) {
  const s = JSON.parse(JSON.stringify(prev)), log = [];
  const err = run(s, a, data, log);
  if (err) return { state: prev, log: [{ type: 'error', msg: err }] };
  seat(s, data);
  if (s.player.status !== prev.player.status) { // 身份变了：公司的牌和公司的麻烦都留在公司
    s.hand = s.hand.filter(id => statusOk(cardOf(data, id), s.player.status));
    s.todo = null;
    s.path.push([s.player.status, s.day]);
    log.push({ type: 'status', to: s.player.status });
  }
  if (s.owe) { draw(s, data, s.owe, log); delete s.owe; }
  return { state: s, log };
}

// 动作：start roll choose{i} play{from,i,arg} discard{i} sell{r} end
//       nego{who,deal,arg,chips} stake{id,n} short{id} quit
function run(s, a, data, log) {
  const c = data.config, p = s.player;
  if (s.phase === 'over') return 'over';
  if (s.pending && a.type !== 'choose' && a.type !== 'quit') return 'pending';
  switch (a.type) {
    case 'start':
      if (s.phase !== 'paper') return 'phase';
      s.phase = 'roll';
      s.pending = s.inbox.shift() || null;
      return;
    case 'roll':
      if (s.phase !== 'roll') return 'phase';
      s.dice = int(s, 1, 6);
      p.pos = (p.pos + s.dice) % c.board.length;
      log.push({ type: 'roll', n: s.dice });
      land(s, data);
      s.phase = 'event';
      return;
    case 'choose': {
      if (!s.pending) return 'option';
      const e = resolve(s, data, a.i);
      if (e) return e;
      if (!s.pending && s.phase === 'event') { s.phase = 'act'; draw(s, data, c.draw, log); }
      return;
    }
    case 'play':
      return s.phase === 'act' ? play(s, data, a, log) : 'phase';
    case 'discard':
      if (s.phase !== 'act' || !(a.i >= 0 && a.i < s.hand.length)) return 'card';
      s.hand.splice(a.i, 1);
      return;
    case 'sell':
      if (s.phase !== 'act') return 'phase';
      if (p.status !== 'ceo') return 'status';
      if (!p.sites[a.r]) return 'region';
      if (s.ap < 1) return 'ap';
      s.ap--;
      applyFx(s, data, { cash: c.site.sell, site: -1, ...c.site.leave }, { region: a.r });
      s.news.push({ k: 'sell', r: a.r, w: 2, mine: true });
      return;
    case 'end':
      if (s.phase !== 'act') return 'phase';
      if (s.hand.length > c.handMax) return 'hand';
      endDay(s, data, log);
      return;
    case 'nego': return s.phase === 'act' ? negotiate(s, data, a, log) : 'phase';
    case 'stake': return s.phase === 'act' ? trade(s, data, a) : 'phase';
    case 'short': return s.phase === 'act' ? short(s, data, a.id) : 'phase';
    case 'quit': finish(s, data, true); return; // 只有主动放弃才算输
  }
  return 'unknown';
}

function endDay(s, data, log) {
  const c = data.config, p = s.player;
  s.strike = 0;
  if (s.todo) { // 没处理的危机今晚爆发，明天见报
    applyFx(s, data, s.todo.fx, { mult: harm(s, data) });
    s.news.push({ k: 'crisis', t: s.todo.t, w: 5 + s.todo.lvl, mine: true });
    if (s.todo.lvl >= 2) s.strike++;
    s.todo = null;
  }
  const inc = income(s, data);
  p.cash += inc;
  if (p.status === 'holder') p.valBonus += int(s, -c.holder.drift, c.holder.drift); // 公司没了你照样在转
  s.ledger = s.ledger.filter(e => { // 暗账：每天小概率翻出，后果加倍
    if (!chance(s, c.ledger.flip)) return true;
    applyFx(s, data, e.fx, { mult: c.ledger.mult * harm(s, data) });
    s.news.push({ k: 'flip', t: e.t, w: 9, mine: true });
    log.push({ type: 'flip', t: e.t });
    p.n.flips = (p.n.flips || 0) + 1;
    s.strike++;
    return false;
  });
  night(s, data);   // 延迟后果到期、天灾、宏观
  npcNight(s, data); // NPC 行动、空单到期
  watch(s, data);   // 世界变量越线
  // 上市后（或控制权跌进风险区）每次重大负面事件都要过一次董事会
  if (p.status === 'ceo' && s.strike && (p.listed || p.control < c.vote.risk)) vote(s, data);
  s.policies = s.policies.filter(x => x.until > s.day);
  settle(s, data);
  seat(s, data);
  log.push({ type: 'night', income: inc });
  const worth = netWorth(s, data);
  if (worth > s.peak[0]) s.peak = [worth, s.day];
  s.me = { inc, worth, d: worth - s.me.worth }; // 明早报纸角落的昨日账
  if (s.day >= c.days || (worth >= c.win && data.npcs.every(n => worth > npcWorth(s, data, n.id)))) return finish(s, data);
  s.day++;
  s.ap = c.ap;
  s.dice = 0;
  s.phase = 'paper';
  s.paper = makePaper(s, data);
  s.news = [];
}

// 胜利：身价过线且高于全部 NPC；回合耗尽：比身价。不要求是 CEO。
function finish(s, data, quit) {
  const c = data.config, worth = netWorth(s, data);
  const npcs = data.npcs.filter(n => s.npcs[n.id].alive).map(n => ({ name: n.name, worth: npcWorth(s, data, n.id) }));
  s.phase = 'over';
  s.pending = null;
  const win = !quit && npcs.every(n => worth > n.worth) && (worth >= c.win || s.day >= c.days);
  s.result = { worth, npcs, day: s.day, quit: !!quit, win, title: fill(s, data, quit ? 'end_quit' : win ? 'end_win' : 'end_lose'), none: s.rewrites.length ? '' : fill(s, data, 'end_none') };
}
