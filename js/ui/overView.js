// 结算页：终刊。分数放后面，前面是「你留下的世界」。
import { icon } from './icons.js';

const WHO = { ceo: 'worth', holder: 'control', out: 'user' };
const LEAN = { family: ['home', '顾家'], work: ['ap', '拼命'], clean: ['shield', '干净'], gray: ['ledger', '灰色'], profit: ['cash', '逐利'], people: ['net', '念旧'] };
const TALLY = [['plays', '出牌'], ['deals', '谈成'], ['built', '建厂'], ['hush', '压下'], ['flips', '翻出']];

const delta = d => (d ? `<span class="num ${d > 0 ? 'pos' : 'neg'}">${icon(d > 0 ? 'up' : 'down')}${Math.abs(d)}</span>` : '<span class="num dim">0</span>');
// 一根条：实心是终局，竖线是开局
const bar = (ic, label, was, now) => `<span class="mtr was" title="${label} ${was} → ${now}">${icon(ic)}<i><b style="width:${now}%"></b><u style="left:${was}%"></u></i>${delta(now - was)}</span>`;

export function overHTML(s, data, press) {
  const r = s.result, p = s.player, W = s.world;
  const rank = [{ name: p.name, worth: r.worth, me: 1 }, ...r.npcs].sort((a, b) => b.worth - a.worth);
  const regions = data.regions.map((x, i) => {
    const w = W.regions[x.id], same = w.industry === x.industry;
    return `<div class="wrow"><span class="tag r${i}">${x.name}</span>${bar('stab', '稳定', x.stability, w.stability)}${bar('acc', '接纳', x.acceptance, w.acceptance)}
      <span class="turn">${icon(x.industry, same ? '' : 'dim')}${same ? '' : icon('next', 'dim') + icon(w.industry, 'neg')}</span></div>`;
  }).join('');
  const inds = data.industries.map(x => {
    const w = W.industries[x.id];
    return `<div class="wrow"><span class="lab">${icon(x.id)}${x.name}</span>${bar('val', '景气', x.boom, w.boom)}${bar('law', '监管', x.regulation, w.regulation)}
      <span class="turn">${data.npcs.filter(n => n.industry === x.id).map(n => `<span class="${s.npcs[n.id].alive ? '' : 'gone'}">${n.name.slice(0, 2)}</span>`).join('')}</span></div>`;
  }).join('');
  const lean = Object.entries(p.lean).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tally = TALLY.filter(([k]) => p.n[k]);
  return `<article class="paper over ${press ? 'press' : ''}">
  <header class="mast"><h1>终刊</h1><div class="dateline"><span>第 ${r.day} 天</span><span>${p.name}</span></div></header>
  <h2 class="head ${r.win ? 'mine' : ''}">${r.title}</h2>
  <div class="fold">
  <h3 class="left">${icon('pen')}你留下的世界</h3>
  ${s.rewrites.length ? `<ol class="line">${s.rewrites.map(x => `<li><span class="num">${x.day}</span><p>${x.title}</p></li>`).join('')}</ol>` : `<p class="desc">${r.none}</p>`}
  <div class="then">${regions}${inds}</div>
  <p class="cap">红线是开局，实心是现在</p>
  ${s.path.length > 1 || lean.length ? `<h3 class="left">${icon('user')}这一局的你</h3>` : ''}
  ${s.path.length > 1 ? `<div class="path">${s.path.map(([st, d], i) => `${i ? icon('next', 'dim') : ''}<span>${icon(WHO[st])}<i class="num">${d}</i></span>`).join('')}</div>` : ''}
  ${lean.length ? `<div class="lean">${lean.map(([k, n]) => `<span>${icon(LEAN[k][0])}${LEAN[k][1]}<i class="num">×${n}</i></span>`).join('')}</div>` : ''}
  <h3 class="left">${icon('worth')}身价<span class="num">${r.worth}</span><em>最高 <span class="num">${s.peak[0]}</span>（第 <span class="num">${s.peak[1]}</span> 天）</em></h3>
  <ol class="rank">${rank.map(x => `<li class="${x.me ? 'mine' : ''}"><span>${x.name}</span><b class="num">${x.worth}</b></li>`).join('')}</ol>
  ${tally.length ? `<div class="tally">${tally.map(([k, t]) => `<span><b class="num">${p.n[k]}</b>${t}</span>`).join('')}</div>` : ''}
  </div>
  <div class="opts row"><button class="primary" data-act="reset">${icon('new')}新局</button><button data-act="copy">${icon('copy')}抄一份</button></div>
</article>`;
}

// 抄一份带走：纯文字版的终刊
export function overText(s) {
  const r = s.result;
  return [`《环球商报》终刊　第 ${r.day} 天`, `${r.title}（身价 ${r.worth}）`, '', '你留下的世界：',
    ...(s.rewrites.length ? s.rewrites.map(x => `第 ${x.day} 天　${x.title}`) : [r.none]), '', `seed ${s.seed}`].join('\n');
}
