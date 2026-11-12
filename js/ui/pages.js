// 开局页、桌面。结算页在 overView.js。
import { icon } from './icons.js';
import { boardHTML } from './boardView.js';
import { handHTML } from './handView.js';

export const startHTML = data => `<article class="paper start press">
  <header class="mast"><h1>大富翁</h1><div class="dateline"><span>Real-Monopoly</span><span>创刊号</span></div></header>
  <h2 class="head">今天，又一家公司要开张</h2>
  <input id="name" maxlength="8" placeholder="公司名" autocomplete="off" aria-label="公司名">
  <div class="opts row">${data.industries.map((x, i) => `<button class="pick ${i ? '' : 'on'}" data-act="ind" data-id="${x.id}">${icon(x.id)}${x.name}</button>`).join('')}</div>
  <button class="primary wide" data-act="new">${icon('play')}开张</button>
  <div class="opts row"><button data-act="import">${icon('load')}导入存档</button><button data-act="help">${icon('q')}图例</button></div>
</article>`;

// ui: { pos, rolling, fresh }  走格动画与发牌动画用
export function deskHTML(s, data, ui = {}) {
  const p = s.player, c = data.config;
  const stat = (ic, v, k, label, cls = '') => `<span class="stat ${cls}" data-k="${k}" title="${label}">${icon(ic)}<b class="num">${v}</b></span>`;
  return `<div class="desk">
  <header class="bar">${stat('cash', p.cash, 'cash', '现金')}${p.status === 'out' ? stat('user', '—', 'control', '普通人', 'neg') : stat('control', p.control + '%', 'control', p.listed ? '持股' : '话事权', p.status === 'holder' ? 'neg' : '')}${
    stat('fame', p.fame, 'fame', '名声')}${stat('day', s.day + '/' + c.days, 'day', '天数')}</header>
  ${boardHTML(s, data, ui)}
  ${handHTML(s, data, ui.fresh)}
  <footer class="dock">
    <button data-act="paper" aria-label="今天的报纸" title="今天的报纸">${icon('paper')}</button><button data-act="world" aria-label="世界" title="世界">${icon('world')}</button><button data-act="co" aria-label="公司" title="公司">${icon('co')}</button>
    <span class="ap" title="行动点">${Array.from({ length: Math.max(c.ap, s.ap) }, (_, i) => icon('ap', i < s.ap ? 'on' : '')).join('')}</span>
    <button class="primary" data-act="end" aria-label="结束这一天" title="结束这一天" ${s.phase === 'act' ? '' : 'disabled'}>${icon('end')}</button>
  </footer></div>`;
}
