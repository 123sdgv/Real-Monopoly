// 卡牌筛选引擎：先按条件过滤，再加权随机。
import { chance, int, pick, weighted } from './rng.js';
import { netWorth } from './company.js';
import { applyFx } from './world.js';

export const LVL = { R: 1, SR: 2, SSR: 3 };
export const cardOf = (data, id) => data.cards.find(c => c.id === id);
export const lvlOf = c => c.lvl ?? LVL[c.rarity];

export function eligible(s, data, c, ignoreCooldown) {
  const p = s.player, w = c.when || {}, nw = netWorth(s, data);
  if (!ignoreCooldown && s.cooldown[c.id] >= s.day) return false;
  if (c.type === 'hole' && s.hole.length >= data.config.holeMax) return false;
  if (nw < (data.config.unlock[c.rarity] ?? -Infinity)) return false;
  if (w.industry && !w.industry.includes(p.industry)) return false;
  if (w.status && !w.status.includes(p.status)) return false;
  if (w.netWorthMin != null && nw < w.netWorthMin) return false;
  if (w.netWorthMax != null && nw > w.netWorthMax) return false;
  if (w.dayMin != null && s.day < w.dayMin) return false;
  if (w.bankrupt != null && w.bankrupt !== (p.status === 'bankrupt')) return false;
  return true;
}

export function draw(s, data, n, log) {
  for (let k = 0; k < n; k++) {
    // 奇迹：无视条件抽一张 SSR
    let pool = chance(s, data.config.miracle) ? data.cards.filter(c => c.rarity === 'SSR' && c.type !== 'hole') : [];
    if (!pool.length) pool = data.cards.filter(c => eligible(s, data, c));
    if (!pool.length) continue;
    const c = weighted(s, pool, x => (x.weight ?? 10) * (x.type === 'net' ? Math.max(0.2, 1 - s.netPenalty) : 1));
    s.cooldown[c.id] = s.day + (c.cooldown || 0);
    (c.type === 'hole' ? s.hole : s.hand).push(c.id);
    log.push({ type: 'draw', id: c.id });
  }
}

// a: { from:'hand'|'hole', i, arg }  arg = 地区 id（建厂牌）或牌类型（万能牌）
export function play(s, data, a, log) {
  const arr = a.from === 'hole' ? s.hole : s.hand, c = cardOf(data, arr[a.i]), p = s.player;
  if (!c) return 'card';
  if (c.type === 'wild') {
    const pool = data.cards.filter(x => x.rarity === c.rarity && x.type === a.arg && eligible(s, data, x, true));
    if (!pool.length) return 'none';
    arr[a.i] = pick(s, pool).id;
    return;
  }
  const fx = c.fx || {}, cost = c.type === 'hole' ? 0 : 1;
  if (s.ap < cost) return 'ap';
  if (fx.suppress || fx.resolve) {
    if (!s.todo) return 'target';
    if (lvlOf(c) < s.todo.lvl) return 'weak';
  }
  if (fx.site && !data.regions.some(r => r.id === a.arg)) return 'region';
  if (fx.cash < 0 && p.cash < -fx.cash) return 'cash';
  s.ap -= cost;
  arr.splice(a.i, 1);
  if (fx.suppress) {
    // 压下：不见报，进暗账，行业监管压力暗中累积
    s.ledger.push({ t: s.todo.t, fx: s.todo.fx, day: s.day });
    s.world.industries[p.industry].regulation += data.config.ledger.regulation;
  }
  if (fx.suppress || fx.resolve) s.todo = null;
  applyFx(s, data, fx, { region: a.arg });
  if (fx.favor) s.queue.push({ k: 'favor', due: s.day + int(s, 10, 18), who: pick(s, data.config.people) });
  if (c.news) s.news.push({ k: c.news, t: c.name, r: a.arg, w: c.w || 3, mine: true });
  log.push({ type: 'play', id: c.id });
}
