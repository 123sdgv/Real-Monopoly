// 晨报。
import { icon } from './icons.js';

const arrow = d => (d ? `<span class="num ${d > 0 ? 'pos' : 'neg'}">${icon(d > 0 ? 'up' : 'down')}${Math.abs(d)}</span>` : '');

// cta：带「开始这一天」的整版；press：今天第一次翻开，头条上墨
export function paperHTML(s, data, cta = true, press = false) {
  const p = s.paper, me = p.me;
  return `<article class="paper ${press ? 'press' : ''}">
  <header class="mast"><h1>环球商报</h1>
    <div class="dateline"><span>第 ${p.day} 天</span><span>${data.regions.map(r => r.name).join('　')}</span></div></header>
  <h2 class="head ${p.head.mine ? 'mine' : ''}">${p.head.title}</h2>
  <div class="fold">
  ${p.items.length ? `<ul class="items">${p.items.map(n => `<li class="${n.mine ? 'mine' : ''}">${n.title}</li>`).join('')}</ul>` : ''}
  <section class="ind">${p.ind.map(x => `<div><span>${icon(x.id)}<b>${x.name}</b><span class="num">${x.boom}</span>${arrow(x.d)}</span>${
    x.co.map(n => `<span class="co">${n.name}<span class="num">${n.worth}</span>${arrow(n.d)}</span>`).join('')}</div>`).join('')}</section>
  <section class="small">${p.small.map(t => `<p>${t}</p>`).join('')}</section>
  ${me && p.day > 1 ? `<p class="acct" title="昨晚入账与身价">${icon('inc')}<span class="num ${me.inc < 0 ? 'neg' : ''}">${me.inc > 0 ? '+' : ''}${me.inc}</span>${icon('worth')}<span class="num">${me.worth}</span>${arrow(me.d)}</p>` : ''}
  </div>
  ${cta ? `<button class="primary wide" data-act="start">${icon('day')}开始这一天</button>` : ''}
</article>`;
}
