// 估值、身价、日收入、上市、董事会投票、身份流转。
// 身份：ceo ──罢免──→ holder ──股份清零──→ out ──翻身牌/底牌──→ ceo；holder ──夺回──→ ceo；ceo ──破产──→ out
import { report } from './news.js';

export const boomF = (s, ind) => s.world.industries[ind].boom / 50;
const lerp = (s, [lo, hi]) => lo + (s.player.fame / 100) * (hi - lo);
// 名声的三处用场：经营收入的倍率、丑闻的杀伤力（名声越差越疼）、贷款的成本
export const fameF = (s, data) => lerp(s, data.config.fame.income);
export const harm = (s, data) => lerp(s, data.config.fame.harm);
export const loanRate = (s, data) => data.config.loan.rate + lerp(s, data.config.fame.loan);

export function valuation(s, data) {
  const c = data.config, p = s.player;
  if (p.status === 'out') return 0;
  let v = c.start.valuation * boomF(s, p.industry) + p.valBonus;
  for (const r in p.sites) v += p.sites[r] * c.site.value;
  return Math.max(0, Math.round(v));
}

export function npcWorth(s, data, id) {
  const n = s.npcs[id], d = data.npcs.find(x => x.id === id);
  return n.alive ? Math.max(data.config.npc.floor, Math.round(n.cash + n.val * boomF(s, d.industry) - n.debt)) : 0;
}

// 个人股票市值：持有的 NPC 股份 + 空单保证金
export const stocks = (s, data) =>
  data.npcs.reduce((a, n) => a + (s.player.stake[n.id] / 100) * npcWorth(s, data, n.id), 0) + s.shorts.reduce((a, x) => a + x.m, 0);

export const netWorth = (s, data) =>
  Math.round(s.player.cash + (s.player.control / 100) * valuation(s, data) + stocks(s, data) - s.player.debt);

export function income(s, data) {
  const c = data.config, p = s.player, due = p.debt * c.income.interest;
  if (p.status === 'out') return Math.round(c.out.wage - due);
  let v = c.income.base * boomF(s, p.industry) + p.inc;
  for (const r of data.regions) {
    const w = s.world.regions[r.id];
    if (w.unrest >= s.day) continue;
    const pol = s.policies.reduce((a, x) => (x.r === r.id && x.until >= s.day ? a * x.v : a), 1);
    v += p.sites[r.id] * c.site.income * (w.acceptance / 50) * (w.industry === p.industry ? c.site.match : 1) * pol;
  }
  for (const d of data.npcs) { // 同行压价打折，盟友加成
    const n = s.npcs[d.id];
    if (!n.alive) continue;
    if (n.war >= s.day && d.industry === p.industry) v *= c.npc.war.f;
    if (n.ally >= s.day) v *= 1 + n.allyV / 100;
  }
  v *= fameF(s, data);
  if (p.status === 'holder') v = Math.max(0, v) * (p.control / 100) * c.holder.div; // 股东只拿分红
  return Math.round(v - due);
}

export function ipo(s, data) {
  const c = data.config.ipo, p = s.player, v = valuation(s, data), got = Math.round(v * c.raise);
  p.cash += got;
  p.valBonus += Math.round(v * c.pop);
  p.control = Math.round(p.control * c.keep);
  p.listed = true;
  s.flags.listed = s.day;
  return got;
}

// 董事会投票：自己的票 + 其余票按名声倒向你 + 股东代表的信任。过半留任，否则罢免。
export function vote(s, data) {
  const c = data.config.vote, p = s.player;
  const yes = Math.max(0, Math.min(100, Math.round(p.control + (100 - p.control) * (p.fame / 100) * c.sway + s.trust * c.trust)));
  const ok = yes >= 50;
  s.inbox.push({ k: 'vote', t: '董事会投票', n: yes, ok, opts: [{ l: 'ok', fx: {} }] });
  report(s, data, ok ? 'voteOk' : 'oust', { n: yes }, ok ? 5 : 10, true);
  if (!ok) p.status = 'holder';
  return ok;
}

export function bust(s, data) {
  const c = data.config.bankrupt, p = s.player;
  s.world.industries[p.industry].boom -= c.boom;
  report(s, data, 'bust', {}, 10, true, true);
  p.status = 'out';
  p.cash = 0; p.control = 0; p.valBonus = 0; p.inc = 0; p.listed = false;
  p.debt = Math.round(p.debt * c.keep);
  p.fame = Math.max(0, p.fame - c.fame);
  for (const r in p.sites) p.sites[r] = 0;
  p.n.busts = (p.n.busts || 0) + 1;
  s.ledger = [];
  s.flags.fell = s.day;
}

export function restart(s, data, ind) {
  const p = s.player;
  p.status = 'ceo'; p.control = 100; p.listed = false; p.shield = 0;
  p.valBonus = data.config.restart.val;
  if (data.industries.some(x => x.id === ind)) p.industry = ind;
  p.n.restarts = (p.n.restarts || 0) + 1;
  report(s, data, 'restart', {}, 8, true);
}

// 股东的座位：股份清零 → 普通人；持股过半 → 自动夺回
export function seat(s, data) {
  const p = s.player;
  if (p.status !== 'holder') return;
  if (p.control <= 0) {
    p.status = 'out'; p.control = 0; p.valBonus = 0; p.inc = 0; p.listed = false;
    for (const r in p.sites) p.sites[r] = 0;
    report(s, data, 'cashout', {}, 6, true);
  } else if (p.control >= data.config.vote.retake) {
    p.status = 'ceo';
    report(s, data, 'retake', {}, 9, true);
  }
}
