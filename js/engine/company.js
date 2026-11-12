// 估值、身价、日收入。上市/董事会/身份流转留给 P3。
export const boomF = (s, ind) => s.world.industries[ind].boom / 50;

export function valuation(s, data) {
  const c = data.config, p = s.player;
  let v = c.start.valuation * boomF(s, p.industry) + p.valBonus;
  for (const r in p.sites) v += p.sites[r] * c.site.value;
  return Math.max(0, Math.round(v));
}

export const netWorth = (s, data) =>
  Math.round(s.player.cash + (s.player.control / 100) * valuation(s, data) - s.player.debt);

export function income(s, data) {
  const c = data.config, p = s.player;
  let v = c.income.base * boomF(s, p.industry) * (0.6 + p.fame / 125);
  for (const r of data.regions) {
    const w = s.world.regions[r.id];
    if (w.unrest >= s.day) continue;
    v += p.sites[r.id] * c.site.income * (w.acceptance / 50) * (r.industry === p.industry ? c.site.match : 1);
  }
  return Math.round(v - p.debt * c.income.interest);
}
