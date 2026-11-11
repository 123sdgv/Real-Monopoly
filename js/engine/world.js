// 世界变量与统一的效果结算。阈值触发与世界事件留给 P2。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// fx 词汇：cash fame control debt val ap draw shield site reveal
//          boom/reg {行业:Δ}  stab/acc {地区:Δ}   键可用 $self（本行业）$here（当前地区）
export function applyFx(s, data, fx, o = {}) {
  if (!fx) return;
  const p = s.player, W = s.world, n = v => Math.round(v * (o.mult || 1));
  const key = k => (k === '$self' ? p.industry : k === '$here' ? o.region : k);
  if (fx.cash) p.cash += n(fx.cash);
  if (fx.fame) p.fame += n(fx.fame);
  if (fx.control) p.control += n(fx.control);
  if (fx.debt) p.debt = Math.max(0, p.debt + n(fx.debt));
  if (fx.val) p.valBonus += n(fx.val);
  if (fx.ap) s.ap = Math.max(0, s.ap + fx.ap);
  if (fx.draw) s.owe = (s.owe || 0) + fx.draw;
  if (fx.shield) p.shield = Math.max(p.shield, s.day + fx.shield);
  if (fx.site && o.region) p.sites[o.region] = Math.max(0, p.sites[o.region] + fx.site);
  if (fx.reveal) {
    let k = fx.reveal;
    for (const q of s.queue) if (k && q.omen && !q.seen) { q.seen = 1; k--; }
  }
  for (const k in fx.boom || {}) W.industries[key(k)].boom += fx.boom[k];
  for (const k in fx.reg || {}) W.industries[key(k)].regulation += fx.reg[k];
  for (const k in fx.stab || {}) if (W.regions[key(k)]) W.regions[key(k)].stability += fx.stab[k];
  for (const k in fx.acc || {}) if (W.regions[key(k)]) W.regions[key(k)].acceptance += fx.acc[k];
  settle(s, data);
}

// 现金见底自动借救急债；所有变量夹回合法区间。
export function settle(s, data) {
  const p = s.player;
  if (p.cash < 0) { p.debt += Math.ceil(-p.cash * data.config.rescue); p.cash = 0; p.fame -= 1; }
  p.fame = clamp(p.fame, 0, 100);
  p.control = clamp(p.control, 0, 100);
  for (const x of Object.values(s.world.industries)) { x.boom = clamp(x.boom, 15, 95); x.regulation = clamp(x.regulation, 0, 100); }
  for (const x of Object.values(s.world.regions)) { x.stability = clamp(x.stability, 0, 100); x.acceptance = clamp(x.acceptance, 0, 100); }
}
