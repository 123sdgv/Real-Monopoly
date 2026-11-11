// 开局页、桌面、结算页。
import { icon } from './icons.js';
import { boardHTML } from './boardView.js';
import { handHTML } from './handView.js';
import { rewrites } from './sheets.js';

export const startHTML = data => `<article class="paper start">
  <header class="mast"><h1>大富翁</h1><div class="dateline"><span>Real-Monopoly</span><span>创刊号</span></div></header>
  <input id="name" maxlength="8" placeholder="公司名" autocomplete="off">
  <div class="opts row">${data.industries.map((x, i) => `<button class="pick ${i ? '' : 'on'}" data-act="ind" data-id="${x.id}">${icon(x.id)}${x.name}</button>`).join('')}</div>
  <button class="primary wide" data-act="new">${icon('play')}开张</button>
  <button class="wide" data-act="import">${icon('load')}导入存档</button>
</article>`;

export function deskHTML(s, data) {
  const p = s.player, c = data.config;
  const stat = (ic, v) => `<span class="stat">${icon(ic)}<b class="num">${v}</b></span>`;
  return `<div class="desk">
  <header class="bar">${stat('cash', p.cash)}${p.status === 'out' ? stat('user', '—') : stat('control', p.control + '%')}${stat('fame', p.fame)}${stat('day', s.day + '/' + c.days)}</header>
  ${boardHTML(s, data)}
  ${handHTML(s, data)}
  <footer class="dock">
    <button data-act="paper">${icon('paper')}</button><button data-act="world">${icon('world')}</button><button data-act="co">${icon('co')}</button>
    <span class="ap">${Array.from({ length: c.ap }, (_, i) => icon('ap', i < s.ap ? 'on' : '')).join('')}</span>
    <button class="primary" data-act="end" ${s.phase === 'act' ? '' : 'disabled'}>${icon('end')}</button>
  </footer></div>`;
}

export function overHTML(s, data) {
  const r = s.result, rank = [{ name: s.player.name, worth: r.worth, me: 1 }, ...r.npcs].sort((a, b) => b.worth - a.worth);
  return `<article class="paper start">
  <header class="mast"><h1>终刊</h1><div class="dateline"><span>第 ${r.day} 天</span><span>${s.player.name}</span></div></header>
  <h2 class="head ${r.win ? 'mine' : ''}">${icon(r.win ? 'worth' : r.quit ? 'stab' : 'end')}<span class="num">${r.worth}</span></h2>
  <ol class="rank">${rank.map(x => `<li class="${x.me ? 'mine' : ''}"><span>${x.name}</span><b class="num">${x.worth}</b></li>`).join('')}</ol>
  ${s.rewrites.length ? `<h3 class="left">${icon('pen')}你留下的世界</h3>${rewrites(s)}` : ''}
  <button class="primary wide" data-act="reset">${icon('new')}新局</button>
</article>`;
}
