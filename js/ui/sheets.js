// 底部弹层：事件、卡牌、公司、菜单。
import { icon } from './icons.js';
import { chips, cardHTML } from './handView.js';
import { cardOf } from '../engine/cards.js';
import { income, netWorth, valuation } from '../engine/company.js';

const KIND = { instant: 'gen', crisis: 'warn', choice: 'dil', region: 'reg', rest: 'rest', favor: 'net' };
const OPT = { ok: 'ok', build: 'ind', sell: 'out', pass: 'next' };

export function eventSheet(s, data) {
  const pe = s.pending, p = s.player;
  const r = pe.region && data.regions.find(x => x.id === pe.region);
  return `<h3>${icon(KIND[pe.k])}${pe.t}${pe.k === 'crisis' ? `<em class="num">Lv${pe.lvl}</em>` : ''}${
    r ? `<em>${icon(r.industry)}${icon('ind')}<span class="num">${p.sites[r.id]}</span></em>` : ''}</h3>
  ${pe.d ? `<p class="desc">${pe.d}</p>` : ''}
  ${pe.k === 'crisis' ? `<p class="fx">${icon('end')}${chips(pe.fx, data)}</p>` : ''}
  <div class="opts">${pe.opts.map((o, i) => {
    const off = pe.opts.length > 1 && o.fx?.cash < 0 && p.cash < -o.fx.cash;
    return `<button data-act="choose" data-i="${i}" ${off ? 'disabled' : ''}>${OPT[o.l] ? icon(OPT[o.l]) : `<b>${o.l}</b>`}<span class="fx">${chips(o.fx, data)}</span></button>`;
  }).join('')}</div>`;
}

export function cardSheet(s, data, from, i) {
  const c = cardOf(data, (from === 'hole' ? s.hole : s.hand)[i]);
  if (!c) return '';
  const fx = c.fx || {}, can = s.phase === 'act';
  const acts = c.type === 'wild'
    ? ['pr', 'fin', 'ops'].map(t => `<button data-act="play" data-arg="${t}" ${can ? '' : 'disabled'}>${icon(t)}</button>`).join('')
    : fx.site
      ? data.regions.map((r, k) => `<button class="tag r${k}" data-act="play" data-arg="${r.id}" ${can ? '' : 'disabled'}>${icon('reg')}${r.name}</button>`).join('')
      : `<button class="primary" data-act="play" ${can ? '' : 'disabled'}>${icon('play')}${c.type === 'hole' ? '' : icon('ap')}</button>`;
  return `<div class="cardsheet">${cardHTML(c, data, 'disabled')}
    <div class="opts row">${acts}${from === 'hand' ? `<button data-act="discard" ${can ? '' : 'disabled'}>${icon('trash')}</button>` : ''}</div></div>`;
}

export function companySheet(s, data) {
  const p = s.player, c = data.config, can = s.phase === 'act' && s.ap > 0;
  const row = (ic, label, v, cls = '') => `<div class="row"><span>${icon(ic)}${label}</span><b class="num ${cls}">${v}</b></div>`;
  return `<h3>${icon(p.industry)}${p.name}</h3>
  ${row('worth', '身价', netWorth(s, data))}${row('val', '估值', valuation(s, data))}${row('day', '日入', income(s, data))}
  ${row('debt', '债务', p.debt, p.debt ? 'neg' : '')}${row('ledger', '暗账', s.ledger.length)}
  ${p.shield >= s.day ? row('shield', '合规', p.shield - s.day + 1) : ''}
  ${data.regions.map((r, i) => `<div class="row"><span class="tag r${i}">${icon('reg')}${r.name}</span><span>${icon(r.industry)}</span>
    <b class="num">${icon('ind')}${p.sites[r.id]}</b>
    <button data-act="sell" data-r="${r.id}" ${can && p.sites[r.id] ? '' : 'disabled'}>${icon('out')}${chips({ cash: c.site.sell }, data)}${icon('ap')}</button></div>`).join('')}`;
}

export const menuSheet = s => `<div class="opts row">
  <button data-act="export">${icon('save')}导出</button><button data-act="import">${icon('load')}导入</button><button data-act="reset">${icon('new')}新局</button>
</div><p class="seed num">seed ${s.seed}</p>`;
