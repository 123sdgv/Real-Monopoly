// 一天的流程。step(状态, 动作, 数据) → { state: 新状态, log: 发生了什么 }，不碰 DOM。
import { chance, int } from './rng.js';
import { draw, play } from './cards.js';
import { land, night, resolve } from './events.js';
import { applyFx, settle } from './world.js';
import { income, netWorth } from './company.js';
import { makePaper } from './paper.js';

export function step(prev, a, data) {
  const s = JSON.parse(JSON.stringify(prev)), log = [];
  const err = run(s, a, data, log);
  if (err) return { state: prev, log: [{ type: 'error', msg: err }] };
  if (s.owe) { draw(s, data, s.owe, log); delete s.owe; }
  return { state: s, log };
}

// 动作：start roll choose{i} play{from,i,arg} discard{i} sell{r} end
function run(s, a, data, log) {
  const c = data.config, p = s.player;
  if (s.phase === 'over') return 'over';
  if (s.pending && a.type !== 'choose') return 'pending';
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
      if (!p.sites[a.r]) return 'region';
      if (s.ap < 1) return 'ap';
      s.ap--;
      applyFx(s, data, { cash: c.site.sell, site: -1 }, { region: a.r });
      s.news.push({ k: 'sell', r: a.r, w: 2, mine: true });
      return;
    case 'end':
      if (s.phase !== 'act') return 'phase';
      if (s.hand.length > c.handMax) return 'hand';
      endDay(s, data, log);
      return;
  }
  return 'unknown';
}

function endDay(s, data, log) {
  const c = data.config, p = s.player;
  if (s.todo) { // 没处理的危机今晚爆发，明天见报
    applyFx(s, data, s.todo.fx);
    s.news.push({ k: 'crisis', t: s.todo.t, w: 5 + s.todo.lvl, mine: true });
    s.todo = null;
  }
  const inc = income(s, data);
  p.cash += inc;
  s.ledger = s.ledger.filter(e => { // 暗账：每天小概率翻出，后果加倍
    if (!chance(s, c.ledger.flip)) return true;
    applyFx(s, data, e.fx, { mult: c.ledger.mult });
    s.news.push({ k: 'flip', t: e.t, w: 9, mine: true });
    log.push({ type: 'flip', t: e.t });
    return false;
  });
  night(s, data);
  settle(s, data);
  log.push({ type: 'night', income: inc });
  if (s.day >= c.days) {
    const worth = netWorth(s, data);
    s.phase = 'over';
    s.result = { worth, win: worth >= c.win };
    return;
  }
  s.day++;
  s.ap = c.ap;
  s.dice = 0;
  s.phase = 'paper';
  s.paper = makePaper(s, data);
  s.news = [];
}
