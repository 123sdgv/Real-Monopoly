// 手牌与效果小标签。纯函数：状态 → HTML 字符串。
import { icon } from './icons.js';
import { cardOf, lvlOf } from '../engine/cards.js';

const num = v => (v > 0 ? '+' : '') + v;
const SOFT = ['cash', 'fame', 'control', 'debt', 'val']; // 会被倍率放大缩小的效果

// 把一组效果按倍率折算（危机的杀伤力随名声变，界面上要给实数）
export const scale = (fx = {}, m = 1) => Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, SOFT.includes(k) ? Math.round(v * m) : v]));

// 把 fx 画成「图标 + 数字」。x.ledger：这一手会记进暗账
export function chips(fx = {}, data, lvl, x = {}) {
  const out = [], add = (ic, v, good) => out.push(`<span class="chip ${good ? 'pos' : 'neg'}">${icon(ic)}${v}</span>`);
  const nm = (list, k) => (k[0] === '$' ? '' : list.find(x => x.id === k)?.name || '');
  if (fx.suppress) add('ledger', 'Lv' + lvl, 1);
  if (fx.resolve) add('ok', 'Lv' + lvl, 1);
  if (fx.cash) add('cash', num(fx.cash), fx.cash > 0);
  if (fx.inc) add('inc', num(fx.inc), fx.inc > 0);
  if (fx.debt) add('debt', num(fx.debt), fx.debt < 0);
  if (fx.control) add('control', num(fx.control), fx.control > 0);
  if (fx.fame) add('fame', num(fx.fame), fx.fame > 0);
  if (fx.val) add('val', num(fx.val), fx.val > 0);
  if (fx.site) add('ind', num(fx.site), fx.site > 0);
  if (fx.ap) add('ap', num(fx.ap), fx.ap > 0);
  if (fx.shield) add('shield', fx.shield, 1);
  if (fx.draw) add('draw', num(fx.draw), 1);
  if (fx.reveal) add('eye', fx.reveal, 1);
  for (const [k, v] of Object.entries(fx.boom || {})) add(v > 0 ? 'up' : 'down', nm(data.industries, k) + num(v), v > 0);
  for (const [k, v] of Object.entries(fx.reg || {})) add('law', nm(data.industries, k) + num(v), v < 0);
  for (const [k, v] of Object.entries(fx.stab || {})) add('stab', nm(data.regions, k) + num(v), v > 0);
  for (const [k, v] of Object.entries(fx.acc || {})) add('acc', nm(data.regions, k) + num(v), v > 0);
  if (fx.restart) add('new', '', 1);
  if (fx.favor) add('net', '…', 0);
  if (x.ledger) add('ledger', '…', 0);
  return out.join('');
}

export function cardHTML(c, data, attrs = '') {
  return `<button class="card ty-${c.type} ra-${c.rarity}" ${attrs}>
    <span class="top">${icon(c.type)}<em>${c.type === 'net' || c.type === 'hole' ? '' : c.rarity}</em></span>
    <strong>${c.name}</strong><span class="fx">${chips(c.fx, data, lvlOf(c), c)}</span></button>`;
}

// fresh：刚抽到的牌的 id，发牌动画只给它们
export function handHTML(s, data, fresh = []) {
  const max = data.config.handMax, isHole = id => cardOf(data, id).type === 'hole';
  const row = (from, ids, n) => ids.map((id, i) => {
    const k = i - (ids.length - n);
    return cardHTML(cardOf(data, id), data, `data-act="card" data-from="${from}" data-i="${i}" ${k >= 0 ? `data-new style="--k:${k}"` : ''}`);
  }).join('');
  return `<div class="handbar"><span class="num ${s.hand.length > max ? 'neg' : ''}">${icon('draw')}${s.hand.length}/${max}</span></div>
  <div class="hand">${row('hole', s.hole, fresh.filter(isHole).length)}${row('hand', s.hand, fresh.filter(id => !isHole(id)).length)}</div>`;
}
