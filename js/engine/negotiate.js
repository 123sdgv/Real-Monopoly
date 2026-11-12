// 谈判：最多选两项筹码，命中对方"在意什么"的数量决定成败。
// 结果数值落在预设区间里，由 存档种子 + 天数 + 对象 算出：同样的选择必然得到同样的结果，不走随机数。
import { applyFx } from './world.js';
import { cardOf } from './cards.js';
import { ipo, loanRate, valuation } from './company.js';
import { merge, mergePrice } from './npc.js';
import { caresOf, report } from './news.js';

const hash = (...xs) => {
  let h = 2166136261;
  for (const ch of xs.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};
export const personOf = (data, id) => data.people.find(x => x.id === id);

// 这笔交易现在能不能谈。返回 null 表示可以。
export function dealErr(s, data, P, deal, arg) {
  const p = s.player, c = data.config, ceo = p.status === 'ceo', is = k => P.kind === k;
  switch (deal) {
    case 'lobby': return !is('official') ? 'target' : !ceo ? 'status' : !p.sites[P.region] ? 'nosite' : s.day - (s.flags['lobby:' + P.region] ?? -99) < c.lobby.cool ? 'cool' : null;
    case 'ipo': return !is('rep') ? 'target' : !ceo ? 'status' : p.listed ? 'active' : valuation(s, data) < c.ipo.min ? 'small' : null;
    case 'loan': return !is('rep') ? 'target' : !ceo ? 'status' : s.flags.loan && s.day - s.flags.loan < c.loan.cool ? 'cool' : null;
    case 'merge': return !is('rep') || !s.npcs[arg]?.alive ? 'target' : !ceo ? 'status' : p.cash < mergePrice(s, data, arg) ? 'cash' : null;
    case 'retake': return !is('rep') ? 'target' : p.status !== 'holder' ? 'status' : p.control < c.vote.min ? 'control' : null;
    case 'ally': return !is('exec') || !s.npcs[P.npc].alive ? 'target' : !ceo ? 'status' : s.npcs[P.npc].ally >= s.day ? 'active' : null;
    case 'intel': return is('fixer') ? null : 'target';
  }
  return 'unknown';
}

// 要命中几项。股东代表：控制权越低、名声越差越难说服；跨行业并购、夺回控制权再加一项。
export function needOf(s, data, P, deal, arg) {
  const p = s.player;
  let n = (P.need || 1) + (p.fame < data.config.fame.shun); // 名声扫地，谁都要你多拿一样东西
  if (P.kind === 'rep') {
    n = 1 + (p.control < 50) + (p.fame < 35) - (s.trust >= 2);
    if (deal === 'retake' || (deal === 'merge' && data.npcs.find(x => x.id === arg)?.industry !== p.industry)) n++;
  }
  return Math.max(1, Math.min(2, n));
}

// 手里能摆上桌的筹码：固定筹码 + 手牌
export function chipsOf(s, data) {
  const c = data.config, p = s.player;
  const fixed = Object.entries(c.chips).filter(([, x]) => !x.status || x.status.includes(p.status)).map(([id, x]) => ({
    id, tags: x.tags, fx: x.fx,
    ok: (!x.fx.cash || p.cash >= -x.fx.cash) && (!x.fx.control || p.control > -x.fx.control) && (!x.fx.fame || p.fame > -x.fx.fame),
  }));
  const cards = s.hand.map((id, i) => {
    const k = cardOf(data, id);
    return { id: 'card:' + i, i, name: k.name, type: k.type, tags: c.cardTags[k.type] || [], fx: {}, ok: true };
  }).filter(x => x.tags.length);
  return fixed.concat(cards);
}

// a: { who, deal, arg, chips: [筹码 id] }
export function negotiate(s, data, a, log) {
  const p = s.player, P = personOf(data, a.who);
  if (!P) return 'target';
  const e = dealErr(s, data, P, a.deal, a.arg);
  if (e) return e;
  if (s.ap < 1) return 'ap';
  const all = chipsOf(s, data), ids = [...new Set(a.chips || [])].slice(0, 2), pickd = ids.map(id => all.find(x => x.id === id));
  if (!pickd.length || pickd.some(x => !x)) return 'chip';
  const cash = pickd.reduce((n, x) => n - (x.fx.cash || 0), 0) + (a.deal === 'merge' ? mergePrice(s, data, a.arg) : 0);
  if (pickd.some(x => !x.ok) || p.cash < cash) return 'cash';
  s.ap--;
  const cares = caresOf(data, P), hits = pickd.filter(x => x.tags.some(t => cares.includes(t)));
  for (const x of hits) for (const t of x.tags) if (cares.includes(t) && !s.known[P.id].includes(t)) s.known[P.id].push(t); // 谈过就摸到了底
  const need = needOf(s, data, P, a.deal, a.arg), ok = hits.length >= need;
  if (P.kind === 'rep') s.trust = Math.max(-3, Math.min(3, s.trust + (ok ? 1 : -1)));
  if (!ok) { log.push({ type: 'deal', ok: false, hits: hits.length, need }); return; } // 没谈成：筹码收回，只丢行动点
  for (const i of pickd.filter(x => x.i != null).map(x => x.i).sort((x, y) => y - x)) s.hand.splice(i, 1);
  for (const x of pickd) applyFx(s, data, x.fx, { region: P.region });
  p.n.deals = (p.n.deals || 0) + 1;
  const f = hash(s.seed, s.day, P.id) * 0.5 + (hits.length > need ? 0.5 : 0); // 超额命中拿区间上半
  log.push({ type: 'deal', ok: true, deal: a.deal, v: close(s, data, P, a, f) });
}

function close(s, data, P, a, f) {
  const c = data.config, p = s.player, span = k => Math.round(c[k].lo + f * (c[k].hi - c[k].lo));
  switch (a.deal) {
    case 'lobby': { // 游说：地区政策在区间内调整，持续 N 天，头版写明是谁推动的
      const v = span('lobby');
      s.policies.push({ r: P.region, v: 1 + v / 100, until: s.day + c.lobby.days });
      s.flags['lobby:' + P.region] = s.day;
      applyFx(s, data, { acc: { $here: c.lobby.acc } }, { region: P.region });
      report(s, data, 'lobby', { r: P.region, n: v }, 8, true, true);
      return v;
    }
    case 'ipo': {
      const v = ipo(s, data);
      applyFx(s, data, { boom: { $self: c.ipo.boom } });
      report(s, data, 'ipo', {}, 9, true, true);
      return v;
    }
    case 'loan': {
      const v = span('loan');
      p.cash += v; p.debt += Math.round(v * loanRate(s, data));
      s.flags.loan = s.day;
      return v;
    }
    case 'merge': return merge(s, data, a.arg);
    case 'retake':
      p.status = 'ceo';
      report(s, data, 'retake', {}, 9, true);
      return p.control;
    case 'ally': {
      const v = span('ally'), n = s.npcs[P.npc];
      n.ally = s.day + c.ally.days; n.allyV = v;
      report(s, data, 'ally', { t: data.npcs.find(x => x.id === P.npc).name }, 5, true);
      return v;
    }
    case 'intel': {
      const v = f >= 0.5 ? 2 : 1;
      applyFx(s, data, { reveal: v });
      return v;
    }
  }
}
