// NPC 公司：每晚按性格行动，同样吃景气与监管，动态见报。玩家可以持股、做空、结盟、并购。
import { chance, weighted } from './rng.js';
import { report } from './news.js';
import { boomF, npcWorth, valuation } from './company.js';
import { applyFx } from './world.js';

const defOf = (data, id) => data.npcs.find(x => x.id === id);

export function npcNight(s, data) {
  const c = data.config.npc, p = s.player;
  for (const d of data.npcs) {
    const n = s.npcs[d.id];
    if (!n.alive) continue;
    n.prev = npcWorth(s, data, d.id);
    const f = boomF(s, d.industry), say = (k, w, mine) => report(s, data, k, { t: d.name, i: d.industry }, w, mine);
    n.cash += Math.round((c.income * f * n.val) / 400 - n.debt * data.config.income.interest);
    n.val += Math.round(c.grow * d.grow * f);
    const can = { expand: n.cash >= c.expand.cost, raise: n.cash < c.expand.cost, war: n.war < s.day, bet: true, idle: true };
    const a = weighted(s, Object.keys(d.acts).filter(k => can[k]), k => d.acts[k]);
    if (a === 'expand') { n.cash -= c.expand.cost; n.val += c.expand.val; if (chance(s, 0.3)) say('npc_expand', 1); }
    else if (a === 'raise') { n.cash += c.raise.cash; n.debt += c.raise.debt; if (chance(s, 0.3)) say('npc_raise', 1); }
    else if (a === 'war') {
      n.war = s.day + c.war.days;
      applyFx(s, data, { boom: { [d.industry]: -c.war.boom } }, { world: true });
      say('npc_war', d.industry === p.industry ? 4 : 2);
    } else if (a === 'bet') {
      const up = chance(s, 0.5);
      n.val = Math.round(n.val * (up ? 1 + c.bet.up : 1 - c.bet.down));
      say(up ? 'npc_up' : 'npc_down', 2);
    }
    if (!n.listed && n.val >= c.ipo.min && chance(s, c.ipo.p)) {
      n.listed = true;
      n.cash += Math.round(n.val * c.ipo.raise);
      n.val = Math.round(n.val * (1 + c.ipo.pop));
      say('npc_ipo', 6);
    }
    if (chance(s, c.scandal.p)) { // 盟友出事，自己受牵连
      const ally = n.ally >= s.day;
      n.val = Math.round(n.val * (1 - c.scandal.val));
      if (ally) applyFx(s, data, { fame: -data.config.ally.fame }, { world: true });
      say('npc_scandal', ally ? 7 : 5, ally);
    }
    if (n.cash < 0) { n.debt -= n.cash; n.cash = 0; }
  }
  const k = data.config.short; // 空单到期
  s.shorts = s.shorts.filter(x => {
    if (x.due > s.day) return true;
    const d = defOf(data, x.id), r = (x.base - npcWorth(s, data, x.id)) / x.base, pnl = Math.round(x.m * k.lev * r);
    p.cash += Math.max(0, x.m + pnl);
    if (r >= k.win) {
      applyFx(s, data, { boom: { [d.industry]: -k.boom } });
      report(s, data, 'short', { t: d.name, i: d.industry, n: pnl }, 8, true, true);
    } else {
      if (s.npcs[x.id].alive) s.npcs[x.id].val += x.dip; // 空头回补，砸出来的坑被填平
      report(s, data, 'shortFail', { t: d.name }, 3, true);
    }
    return false;
  });
}

// 买卖股份：a.id 是 NPC，或 'self'（股东买卖自家股份）；a.n 正买负卖，每次一档
export function trade(s, data, a) {
  const c = data.config.stock, p = s.player, k = c.step, buy = a.n > 0, self = a.id === 'self';
  if (s.ap < 1) return 'ap';
  if (self ? p.status !== 'holder' : !s.npcs[a.id]?.alive) return self ? 'status' : 'target';
  if (!self && buy && !s.npcs[a.id].listed) return 'private'; // 没上市的公司，股票不在市面上
  const per = ((self ? Math.max(1, valuation(s, data)) : npcWorth(s, data, a.id)) * k) / 100;
  const own = self ? p.control : p.stake[a.id];
  let q = k;
  if (buy) {
    const cost = Math.round(per * (1 + c.fee));
    if (own + k > (self ? 100 : c.max)) return 'max';
    if (p.cash < cost) return 'cash';
    p.cash -= cost;
  } else {
    q = self ? Math.min(k, own) : k;
    if (!q || own < q) return 'none';
    p.cash += Math.round((per * q) / k);
    q = -q;
  }
  if (self) p.control += q; else p.stake[a.id] += q;
  s.ap--;
}

export function short(s, data, id) {
  const c = data.config.short, p = s.player, n = s.npcs[id];
  if (!n?.alive) return 'target';
  if (!n.listed) return 'private';
  if (s.shorts.some(x => x.id === id)) return 'active';
  if (s.ap < 1) return 'ap';
  if (p.cash < c.size) return 'cash';
  s.ap--;
  p.cash -= c.size;
  const dip = Math.round(n.val * c.push);
  s.shorts.push({ id, m: c.size, base: npcWorth(s, data, id), due: s.day + c.days, dip });
  n.val -= dip;
}

export const mergePrice = (s, data, id) =>
  Math.round(npcWorth(s, data, id) * data.config.merge.premium * (1 - s.player.stake[id] / 100));

export function merge(s, data, id) {
  const c = data.config.merge, p = s.player, n = s.npcs[id], d = defOf(data, id), price = mergePrice(s, data, id);
  p.cash -= price;
  p.valBonus += Math.round(n.val * boomF(s, d.industry) * c.keep);
  p.inc += c.income;
  p.stake[id] = 0;
  s.shorts = s.shorts.filter(x => x.id !== id || ((p.cash += x.m), false));
  n.alive = false; n.ally = 0; n.war = 0;
  p.n.merged = (p.n.merged || 0) + 1;
  s.flags.merged = s.day;
  applyFx(s, data, { reg: { [d.industry]: c.reg } });
  report(s, data, 'merge', { t: d.name }, 10, true, true);
  return price;
}
