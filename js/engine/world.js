// 世界变量、统一的效果结算、越线触发的世界事件、"因你而变"的归因。
import { pick } from './rng.js';
import { fill, hidden } from './news.js';
import { bust, valuation } from './company.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// fx 词汇：cash fame control debt val ap draw shield site reveal
//          boom/reg {行业:Δ}  stab/acc {地区:Δ}   键可用 $self（本行业）$here（当前地区）$it（事件对象）$all
// o: { region, it, mult, world }   world=true：不是玩家推动的（宏观、NPC、世界事件本身），不计入归因
export function applyFx(s, data, fx, o = {}) {
  if (!fx) return;
  const p = s.player, W = s.world, n = v => Math.round(v * (o.mult || 1));
  const keys = (k, all) => (k === '$all' ? Object.keys(all) : [k === '$self' ? p.industry : k === '$here' ? o.region : k === '$it' ? o.it : k]);
  const bump = (kind, all, field, map) => {
    for (const k0 in map || {}) for (const k of keys(k0, all)) {
      if (!all[k]) continue;
      all[k][field] += map[k0];
      if (!o.world) s.push[kind + ':' + k] = (s.push[kind + ':' + k] || 0) + map[k0];
    }
  };
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
    learn(s, data, fx.reveal);
  }
  bump('boom', W.industries, 'boom', fx.boom);
  bump('reg', W.industries, 'regulation', fx.reg);
  bump('stab', W.regions, 'stability', fx.stab);
  bump('acc', W.regions, 'acceptance', fx.acc);
  settle(s, data);
}

// 揭开 n 个还没看穿的"在意什么"
export function learn(s, data, n = 1) {
  for (; n > 0; n--) {
    const shy = data.people.filter(P => hidden(s, data, P).length);
    if (!shy.length) return;
    const P = pick(s, shy);
    s.known[P.id].push(hidden(s, data, P)[0]);
  }
}

// 现金见底：股东被迫卖股；CEO 借救急债，借不动就破产。所有变量夹回合法区间。
export function settle(s, data) {
  const p = s.player, c = data.config;
  if (p.cash < 0 && p.status === 'holder' && p.control > 0) {
    const per = Math.max(1, valuation(s, data)) / 100, k = Math.min(p.control, Math.ceil(-p.cash / per));
    p.cash += Math.round(k * per);
    p.control -= k;
  }
  if (p.cash < 0) {
    const need = Math.ceil(-p.cash * c.rescue);
    if (p.status === 'ceo' && p.debt + need > c.bankrupt.cap * valuation(s, data) + c.bankrupt.base) bust(s, data);
    else { p.debt += need; p.cash = 0; p.fame -= 1; }
  }
  p.fame = clamp(p.fame, 0, 100);
  p.control = clamp(p.control, 0, 100);
  for (const x of Object.values(s.world.industries)) { x.boom = clamp(x.boom, 15, 95); x.regulation = clamp(x.regulation, 0, 100); }
  for (const x of Object.values(s.world.regions)) { x.stability = clamp(x.stability, 0, 100); x.acceptance = clamp(x.acceptance, 0, 100); }
}

// 世界结算：变量越线 → 世界事件。once 或带冷却；事件留下 flag，永久改变牌池和报纸。
export function watch(s, data) {
  const W = s.world, p = s.player;
  const me = { fame: p.fame, sites: p.status === 'ceo' ? Object.values(p.sites).reduce((a, b) => a + b, 0) : 0 };
  for (const ev of data.world) {
    const [kind, v] = ev.on.split('.');
    const its = kind === 'ind' ? Object.keys(W.industries) : kind === 'reg' ? Object.keys(W.regions) : [''];
    for (const it of its) {
      const val = kind === 'ind' ? W.industries[it][v] : kind === 'reg' ? W.regions[it][v] : me[v];
      if (ev.gte != null ? val < ev.gte : val > ev.lte) continue;
      if (ev.sites && !(p.status === 'ceo' && p.sites[it] >= ev.sites)) continue;
      const id = ev.id + (it ? ':' + it : ''), last = s.flags[id];
      if (last && (!ev.cool || s.day - last < ev.cool)) continue;
      s.flags[id] = s.flags[ev.id] = s.day;
      fire(s, data, ev, kind, v, it);
    }
  }
}

function fire(s, data, ev, kind, v, it) {
  const p = s.player, W = s.world, x = ev.do || {}, o = { region: kind === 'reg' ? it : undefined, it, world: true };
  // 归因：这条线是不是玩家推过去的
  const mine = ev.mine === true || (!!ev.mine && (s.push[ev.mine + ':' + it] || 0) * (ev.dir || 1) >= (ev.min || data.config.mine));
  const hit = p.status === 'ceo' && (kind === 'ind' ? it === p.industry && p.shield < s.day : kind === 'reg' ? p.sites[it] > 0 : true);
  applyFx(s, data, ev.fx, o);
  if (hit && ev.hit) { applyFx(s, data, ev.hit, o); if (ev.strike) s.strike++; }
  if (x.set != null) (kind === 'ind' ? W.industries : W.regions)[it][v] = x.set;
  if (x.npc) for (const d of data.npcs) if (d.industry === it && s.npcs[d.id].alive) s.npcs[d.id].val = Math.round(s.npcs[d.id].val * (1 + x.npc / 100));
  if (x.rotate) { // 主导产业易主：换成眼下最景气的另一个行业
    const R = W.regions[it];
    R.industry = data.industries.filter(i => i.id !== R.industry).sort((a, b) => W.industries[b.id].boom - W.industries[a.id].boom)[0].id;
  }
  if (x.unrest) W.regions[it].unrest = s.day + x.unrest;
  if (x.ban) W.regions[it].ban = s.day + x.ban;
  if (x.lose && hit) p.sites[it] = Math.max(0, p.sites[it] - x.lose);
  if (x.policy) s.policies.push({ r: it, v: x.policy, until: s.day + x.days });
  const H = data.headlines, title = fill(s, data, mine && H[ev.id + '_me'] ? ev.id + '_me' : ev.id, kind === 'reg' ? { r: it } : { i: it });
  s.news.push({ title, w: ev.w || 8, mine });
  if (mine) s.rewrites.push({ day: s.day, k: ev.id, title });
}
