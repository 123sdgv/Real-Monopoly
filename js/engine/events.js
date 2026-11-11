// 格子事件、抉择、宏观事件、延迟后果。NPC 行动与世界事件在 npc.js / world.js，由 day.js 依次调用。
import { chance, int, pick, weighted } from './rng.js';
import { applyFx } from './world.js';

const opt = (l, fx = {}, x = {}) => ({ l, fx, ...x });

// 落在格子上：生成一个待处理事件 s.pending。不在 CEO 位置上时，公司的事轮不到你，只有私事。
export function land(s, data) {
  const c = data.config, p = s.player, tile = c.board[p.pos], E = data.events, ceo = p.status === 'ceo';
  if (tile === 'rest') { s.pending = { k: 'rest', t: '休息', opts: [opt('ok', { draw: 1 })] }; return; }
  if (ceo && tile.startsWith('reg:')) {
    const r = tile.slice(4), ban = s.world.regions[r].ban >= s.day;
    s.pending = {
      k: 'region', t: data.regions.find(x => x.id === r).name, region: r,
      opts: [
        ...(ban ? [] : [opt('build', { cash: -c.site.cost, site: 1, acc: { $here: 2 } }, { news: 'build' })]),
        ...(p.sites[r] ? [opt('sell', { cash: c.site.sell, site: -1, ...c.site.leave }, { news: 'sell' })] : []),
        opt('pass'),
      ],
    };
    return;
  }
  const ev = tile === 'dil' ? pick(s, data.dilemmas)
    : weighted(s, !ceo ? E.life : tile === 'ind' ? E.ind[p.industry] : E.gen, e => e.p ?? 10);
  s.pending = ev.k === 'crisis'
    ? { k: 'crisis', t: ev.t, d: ev.d, lvl: ev.lvl, fx: ev.fx, opts: [opt('ok')] }
    : { k: ev.opts ? 'choice' : 'instant', t: ev.t, d: ev.d, w: ev.w, opts: ev.opts || [opt('ok', ev.fx)] };
}

export function resolve(s, data, i) {
  const pe = s.pending, o = pe.opts[i], p = s.player;
  if (!o) return 'option';
  const fx = o.fx || {};
  if (pe.opts.length > 1 && fx.cash < 0 && p.cash < -fx.cash) return 'cash';
  if (pe.k === 'crisis') s.todo = { t: pe.t, lvl: pe.lvl, fx: pe.fx }; // 进入待办，今晚不处理就爆
  applyFx(s, data, fx, { region: pe.region });
  if (o.lean) p.lean[o.lean] = (p.lean[o.lean] || 0) + 1;
  if (o.ledger) s.ledger.push({ ...o.ledger, day: s.day });
  if (o.pen) s.netPenalty += o.pen;
  const k = o.news || (pe.w ? 'ev' : null);
  if (k) s.news.push({ k, t: pe.t, r: pe.region, w: pe.w || 3, mine: true });
  s.pending = s.inbox.shift() || null;
}

// 夜间世界结算：到期后果、天灾、宏观事件、景气漂移、埋下新的前兆
export function night(s, data) {
  const c = data.config, p = s.player, W = s.world, rest = [];
  for (const q of s.queue) {
    if (q.due > s.day) { rest.push(q); continue; }
    if (q.k === 'pol') {
      const n = p.sites[q.r] * c.pol.loss;
      W.regions[q.r].stability -= c.pol.stab;
      W.regions[q.r].unrest = s.day + c.pol.days;
      p.cash -= n;
      s.news.push({ k: 'pol', r: q.r, n, w: 8, mine: n > 0 });
    } else if (q.k === 'reg') {
      const I = W.industries[q.i], hit = q.i === p.industry, safe = hit && p.shield >= s.day;
      I.regulation += c.reg.up;
      I.boom -= c.reg.boom;
      if (hit && !safe && p.status === 'ceo') { p.cash -= c.reg.fine; p.fame -= c.reg.fame; s.strike++; }
      for (const d of data.npcs) if (d.industry === q.i) s.npcs[d.id].val = Math.round(s.npcs[d.id].val * (1 - c.reg.npc)); // NPC 也跟着倒霉
      s.news.push({ k: hit && safe ? 'regSafe' : 'reg', i: q.i, n: c.reg.fine, w: 8, mine: hit && p.status === 'ceo' });
    } else if (q.k === 'favor') {
      s.inbox.push({
        k: 'favor', t: q.who + '来电', d: '上次的忙，该还了。',
        opts: [opt('答应', { cash: -c.favor.cash }), opt('拒绝', { fame: -c.favor.fame }, { pen: c.favor.pen })],
      });
    }
  }
  s.queue = rest;
  if (chance(s, c.nat.chance)) { // 天灾没有前兆
    const r = pick(s, data.regions).id, n = p.sites[r] * c.nat.loss;
    p.cash -= n;
    s.news.push({ k: 'nat', r, n, w: 7, mine: n > 0 });
  }
  if (s.day % c.macroEvery === 0) {
    const m = pick(s, data.events.macro);
    applyFx(s, data, m.fx, { world: true });
    s.news.push({ k: 'macro', t: m.t, w: 8 });
  }
  for (const x of Object.values(W.industries)) x.boom += int(s, -2, 2);
  if (s.queue.filter(q => q.omen).length < 2 && chance(s, c.omen.chance)) {
    const due = s.day + int(s, c.omen.leadMin, c.omen.leadMax);
    s.queue.push(chance(s, 0.5)
      ? { k: 'pol', omen: 1, due, r: weighted(s, data.regions, r => 110 - W.regions[r.id].stability).id }
      : { k: 'reg', omen: 1, due, i: weighted(s, data.industries, x => 20 + W.industries[x.id].regulation).id });
  }
}
