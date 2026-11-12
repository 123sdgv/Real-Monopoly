// 底部弹层：事件、卡牌、公司、世界、对手、谈判。
import { icon } from './icons.js';
import { chips, cardHTML } from './handView.js';
import { cardOf, statusOk } from '../engine/cards.js';
import { income, netWorth, npcWorth, valuation } from '../engine/company.js';
import { chipsOf, dealErr, needOf, personOf } from '../engine/negotiate.js';
import { mergePrice } from '../engine/npc.js';
import { caresOf } from '../engine/news.js';

const KIND = { instant: 'gen', crisis: 'warn', choice: 'dil', region: 'reg', rest: 'rest', favor: 'net', vote: 'vote' };
const OPT = { ok: 'ok', build: 'ind', sell: 'out', pass: 'next' };
const TAG = { job: 'job', green: 'green', face: 'fame', money: 'cash', power: 'control', favor: 'net' }; // 在意什么 → 图标
const DEAL = { lobby: 'law', ipo: 'ipo', loan: 'fin', merge: 'merge', retake: 'worth', ally: 'ally', intel: 'eye' };
const STATUS = { ceo: 'worth', holder: 'control', out: 'user' };
const off = ok => (ok ? '' : 'disabled');

export function eventSheet(s, data) {
  const pe = s.pending, p = s.player;
  const r = pe.region && data.regions.find(x => x.id === pe.region);
  return `<h3>${icon(KIND[pe.k])}${pe.t}${pe.k === 'crisis' ? `<em class="num">Lv${pe.lvl}</em>` : ''}${
    r ? `<em>${icon(s.world.regions[r.id].industry)}${icon('ind')}<span class="num">${p.sites[r.id]}</span></em>` : ''}</h3>
  ${pe.d ? `<p class="desc">${pe.d}</p>` : ''}
  ${pe.k === 'crisis' ? `<p class="fx">${icon('end')}${chips(pe.fx, data)}</p>` : ''}
  ${pe.k === 'vote' ? `<div class="meter"><i class="${pe.ok ? '' : 'neg'}" style="width:${pe.n}%"></i><b></b></div>
    <p class="fx big ${pe.ok ? 'pos' : 'neg'}"><span class="num">${pe.n}%</span>${icon(pe.ok ? 'worth' : 'out')}</p>` : ''}
  <div class="opts">${pe.opts.map((o, i) => {
    const no = pe.opts.length > 1 && o.fx?.cash < 0 && p.cash < -o.fx.cash;
    return `<button data-act="choose" data-i="${i}" ${off(!no)}>${OPT[o.l] ? icon(OPT[o.l]) : `<b>${o.l}</b>`}<span class="fx">${chips(o.fx, data)}</span></button>`;
  }).join('')}</div>`;
}

export function cardSheet(s, data, from, i) {
  const c = cardOf(data, (from === 'hole' ? s.hole : s.hand)[i]);
  if (!c) return '';
  const fx = c.fx || {}, can = off(s.phase === 'act' && statusOk(c, s.player.status));
  const acts = c.type === 'wild'
    ? ['pr', 'fin', 'ops'].map(t => `<button data-act="play" data-arg="${t}" ${can}>${icon(t)}</button>`).join('')
    : fx.site
      ? data.regions.map((r, k) => `<button class="tag r${k}" data-act="play" data-arg="${r.id}" ${can}>${icon('reg')}${r.name}</button>`).join('')
      : fx.restart
        ? data.industries.map(x => `<button data-act="play" data-arg="${x.id}" ${can}>${icon(x.id)}${x.name}</button>`).join('')
        : `<button class="primary" data-act="play" ${can}>${icon('play')}${c.type === 'hole' ? '' : icon('ap')}</button>`;
  return `<div class="cardsheet">${cardHTML(c, data, 'disabled')}
    <div class="opts row">${acts}${from === 'hand' ? `<button data-act="discard" ${off(s.phase === 'act')}>${icon('trash')}</button>` : ''}</div></div>`;
}

export function companySheet(s, data) {
  const p = s.player, c = data.config, can = s.phase === 'act' && s.ap > 0, rep = personOf(data, 'rep');
  const row = (ic, label, v, cls = '') => `<div class="row"><span>${icon(ic)}${label}</span><b class="num ${cls}">${v}</b></div>`;
  const deal = (d, label, need = '') => `<button data-act="nego" data-who="rep" data-deal="${d}" ${off(can && !dealErr(s, data, rep, d))}>${icon(DEAL[d])}${label}${need}</button>`;
  const share = n => `<button data-act="stake" data-id="self" data-n="${n}" ${off(can)}>${icon(n > 0 ? 'plus' : 'minus')}${c.stock.step}%${icon('ap')}</button>`;
  const trust = `<span class="trust">${[1, 2, 3].map(k => `<i class="${s.trust >= k ? 'pos' : -s.trust >= k ? 'neg' : ''}"></i>`).join('')}</span>`;
  return `<h3>${icon(p.industry)}${p.name}<em>${p.listed ? icon('ipo') : ''}${icon(STATUS[p.status])}</em></h3>
  ${row('worth', '身价', netWorth(s, data))}
  ${p.status === 'out' ? '' : row('val', '估值', valuation(s, data)) + row('control', p.listed ? '持股' : '话事权', p.control + '%', p.control < c.vote.risk ? 'neg' : '')}
  ${row('day', '日入', income(s, data))}${row('debt', '债务', p.debt, p.debt ? 'neg' : '')}
  ${p.status === 'ceo' ? row('ledger', '暗账', s.ledger.length) : ''}${p.shield >= s.day ? row('shield', '合规', p.shield - s.day + 1) : ''}
  ${p.status === 'out' ? '' : `<div class="row"><span>${icon('user')}${rep.name}</span>${trust}</div>`}
  ${p.status !== 'ceo' ? '' : data.regions.map((r, i) => `<div class="row"><span class="tag r${i}">${icon('reg')}${r.name}</span><span>${icon(s.world.regions[r.id].industry)}</span>
    <b class="num">${icon('ind')}${p.sites[r.id]}</b>
    <button data-act="sell" data-r="${r.id}" ${off(can && p.sites[r.id])}>${icon('out')}${chips({ cash: c.site.sell }, data)}${icon('ap')}</button></div>`).join('')}
  <div class="opts row">${p.status === 'ceo' ? deal('ipo', '上市', p.listed ? '' : `<span class="chip">${icon('val')}${c.ipo.min}</span>`) + deal('loan', '贷款')
    : p.status === 'holder' ? share(-1) + share(1) + deal('retake', '夺回') : ''}</div>
  <div class="opts row menu">
    <button data-act="export">${icon('save')}</button><button data-act="import">${icon('load')}</button><button data-act="quit">${icon('stab')}</button>
  </div><p class="seed num">seed ${s.seed}</p>`;
}

export function worldSheet(s, data) {
  const p = s.player, W = s.world, can = s.phase === 'act' && s.ap > 0;
  const bar = (ic, v, hot) => `<span class="mtr ${hot ? 'hot' : ''}">${icon(ic)}<i><b style="width:${v}%"></b></i></span>`;
  const go = (P, d) => `<button class="go" data-act="nego" data-who="${P.id}" data-deal="${d}" ${off(can && !dealErr(s, data, P, d))}>${icon('deal')}</button>`;
  const regions = data.regions.map((r, i) => {
    const w = W.regions[r.id], pol = s.policies.reduce((a, x) => (x.r === r.id && x.until >= s.day ? a * x.v : a), 1);
    return `<div class="wrow"><span class="tag r${i}">${icon(w.industry)}${r.name}</span>
      ${bar('stab', w.stability, w.stability < 35)}${bar('acc', w.acceptance, w.acceptance < 35)}
      <span class="num">${icon('ind')}${p.sites[r.id]}</span>
      <span class="marks">${pol > 1 ? `<span class="chip pos">${icon('up')}${Math.round((pol - 1) * 100)}%</span>` : ''}${
        w.unrest >= s.day ? icon('warn', 'neg') : ''}${w.ban >= s.day ? icon('ban', 'neg') : ''}</span>
      ${go(data.people.find(x => x.region === r.id), 'lobby')}</div>`;
  }).join('');
  const inds = data.industries.map(x => {
    const w = W.industries[x.id];
    const cos = data.npcs.filter(n => n.industry === x.id && s.npcs[n.id].alive).map(n => `<button class="co" data-act="npc" data-id="${n.id}">${n.name}<b class="num">${npcWorth(s, data, n.id)}</b>${
      p.stake[n.id] ? `<span class="chip">${icon('control')}${p.stake[n.id]}%</span>` : ''}</button>`).join('');
    return `<div class="wrow"><span class="lab">${icon(x.id)}${x.name}<span class="num">${w.boom}</span></span>${bar('law', w.regulation, w.regulation >= 65)}${cos}</div>`;
  }).join('');
  const fixer = data.people.find(x => x.kind === 'fixer');
  return `${regions}${inds}
  <div class="wrow"><span class="lab">${icon('eye')}${fixer.name}</span>${go(fixer, 'intel')}</div>
  ${s.rewrites.length ? `<h4>${icon('pen')}${s.rewrites.length}</h4>${rewrites(s)}` : ''}`;
}

export const rewrites = (s, old) => `<ol class="rew">${(old ? s.rewrites : s.rewrites.slice().reverse()).map(r => `<li><span class="num">${r.day}</span>${r.title}</li>`).join('')}</ol>`;

export function npcSheet(s, data, id) {
  const d = data.npcs.find(x => x.id === id), n = s.npcs[id], p = s.player, c = data.config;
  if (!n?.alive) return '';
  const can = s.phase === 'act' && s.ap > 0, w = npcWorth(s, data, id), k = c.stock.step, per = (w * k) / 100, cost = Math.round(per * (1 + c.stock.fee));
  const X = data.people.find(x => x.npc === id), rep = personOf(data, 'rep'), sh = s.shorts.find(x => x.id === id);
  const left = (ic, day, cls) => (day >= s.day ? `<span class="chip ${cls}">${icon(ic)}${day - s.day + 1}</span>` : '');
  const btn = (attrs, ok, ic, label, right) => `<button ${attrs} ${off(can && ok)}><span>${icon(ic)}${label}</span><span class="fx">${right}${icon('ap')}</span></button>`;
  return `<h3>${icon(d.industry)}${d.name}<em>${n.listed ? icon('ipo') : ''}${icon('worth')}<span class="num">${w}</span></em></h3>
  <p class="fx">${icon('control')}<span class="num">${p.stake[id]}%</span>${left('ally', n.ally, 'pos')}${left('down', n.war, 'neg')}${sh ? left('short', sh.due, '') : ''}</p>
  <div class="opts">
    ${btn(`data-act="stake" data-id="${id}" data-n="1"`, p.stake[id] + k <= c.stock.max && p.cash >= cost, 'plus', k + '%', chips({ cash: -cost }, data))}
    ${btn(`data-act="stake" data-id="${id}" data-n="-1"`, p.stake[id] >= k, 'minus', k + '%', chips({ cash: Math.round(per) }, data))}
    ${btn(`data-act="short" data-id="${id}"`, !sh && p.cash >= c.short.size, 'short', '做空', chips({ cash: -c.short.size }, data))}
    ${btn(`data-act="nego" data-who="${X.id}" data-deal="ally"`, !dealErr(s, data, X, 'ally'), 'ally', '结盟', icon('deal'))}
    ${btn(`data-act="nego" data-who="rep" data-deal="merge" data-arg="${id}"`, !dealErr(s, data, rep, 'merge', id), 'merge', '并购', chips({ cash: -mergePrice(s, data, id) }, data) + icon('deal'))}
  </div>`;
}

// sh: { who, deal, arg, pick: [筹码 id] }
export function negoSheet(s, data, sh) {
  const P = personOf(data, sh.who), p = s.player, c = data.config;
  const known = s.known[P.id], need = needOf(s, data, P, sh.deal, sh.arg), all = chipsOf(s, data);
  const hits = sh.pick.filter(id => all.find(x => x.id === id)?.tags.some(t => known.includes(t))).length;
  const span = (k, unit = '') => `${c[k].lo}–${c[k].hi}${unit}`, days = k => `${icon('day')}${c[k].days}`;
  const gain = {
    lobby: () => `${icon('ind')}${icon('up')}${span('lobby', '%')}${days('lobby')}`,
    ipo: () => chips({ cash: Math.round(valuation(s, data) * c.ipo.raise), control: Math.round(p.control * c.ipo.keep) - p.control, val: Math.round(valuation(s, data) * c.ipo.pop) }, data),
    loan: () => `${icon('cash')}+${span('loan')}${icon('debt')}×${c.loan.rate}`,
    merge: () => chips({ cash: -mergePrice(s, data, sh.arg) }, data) + icon('merge'),
    retake: () => icon('worth'),
    ally: () => `${icon('cash')}${icon('up')}${span('ally', '%')}${days('ally')}`,
    intel: () => `${icon('eye')}1–2`,
  }[sh.deal]();
  const chip = x => `<button class="nchip ${sh.pick.includes(x.id) ? 'on' : ''}" data-act="chip" data-id="${x.id}" ${off(x.ok)}>
    ${icon(TAG[x.tags[0]])}${x.name ? `<b>${x.name}</b>` : `<span class="fx">${chips(x.fx, data)}</span>`}</button>`;
  return `<h3>${icon(DEAL[sh.deal])}${P.name}<em>${P.role}</em></h3>
  <p class="desc">${P.clue}</p>
  <div class="cares">${caresOf(data, P).map(t => (known.includes(t) ? icon(TAG[t]) : icon('q', 'dim'))).join('')}
    <span class="need">${Array.from({ length: need }, (_, i) => `<i class="${i < hits ? 'on' : ''}"></i>`).join('')}</span></div>
  <p class="fx gain">${gain}</p>
  <div class="chips">${all.map(chip).join('')}</div>
  <button class="primary wide" data-act="deal" ${off(sh.pick.length && s.phase === 'act' && s.ap > 0 && !dealErr(s, data, P, sh.deal, sh.arg))}>${icon('deal')}${icon('ap')}</button>`;
}
