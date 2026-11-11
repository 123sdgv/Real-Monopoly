// 外壳：加载数据、保存状态、把点击变成动作交给引擎、重画。
import { newGame } from './engine/state.js';
import { step } from './engine/day.js';
import { clear, load, parse, save, serialize } from './engine/save.js';
import { paperHTML } from './ui/paperView.js';
import { deskHTML, overHTML, startHTML } from './ui/pages.js';
import { cardSheet, companySheet, eventSheet, menuSheet } from './ui/sheets.js';

const $ = q => document.querySelector(q);
const FILES = ['config', 'cards', 'events', 'dilemmas', 'regions', 'industries', 'headlines'];
const MSG = { ap: '行动点不足', cash: '现金不足', weak: '等级不够', target: '今天没有危机', hand: '先弃牌', none: '没有可变的牌', region: '选一个地区' };
const clean = t => String(t || '').replace(/[<>&"']/g, '').trim().slice(0, 8);
let data, state = null, sheet = null, timer;

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), 1400);
}
const persist = () => { try { state ? save(localStorage, state) : clear(localStorage); } catch {} };

function render() {
  $('#app').innerHTML = !state ? startHTML(data)
    : state.phase === 'over' ? overHTML(state, data)
    : state.phase === 'paper' ? paperHTML(state, data) : deskHTML(state, data);
  const live = state && state.phase !== 'over';
  const html = !live ? '' : state.pending ? eventSheet(state, data)
    : !sheet ? '' : sheet.type === 'card' ? cardSheet(state, data, sheet.from, sheet.i)
    : sheet.type === 'co' ? companySheet(state, data)
    : sheet.type === 'menu' ? menuSheet(state) : paperHTML(state, data, false);
  const el = $('#sheet');
  el.innerHTML = html ? `<div class="back" ${state.pending ? '' : 'data-act="close"'}></div><div class="panel">${html}</div>` : '';
  el.hidden = !html;
}

function dispatch(a, keep) {
  const r = step(state, a, data), e = r.log.find(l => l.type === 'error');
  if (e) return toast(MSG[e.msg] || e.msg);
  state = r.state;
  if (!keep) sheet = null;
  persist();
  render();
  window.scrollTo(0, 0);
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  switch (d.act) {
    case 'ind':
      document.querySelectorAll('.pick').forEach(b => b.classList.toggle('on', b === el));
      break;
    case 'new': {
      const seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
      state = newGame(data, seed, { name: clean($('#name').value) || '无名公司', industry: $('.pick.on').dataset.id });
      persist(); render();
      break;
    }
    case 'start': case 'roll': case 'end': dispatch({ type: d.act }); break;
    case 'choose': dispatch({ type: 'choose', i: +d.i }); break;
    case 'card': sheet = { type: 'card', from: d.from, i: +d.i }; render(); break;
    case 'play': dispatch({ type: 'play', from: sheet.from, i: sheet.i, arg: d.arg }); break;
    case 'discard': dispatch({ type: 'discard', i: sheet.i }); break;
    case 'sell': dispatch({ type: 'sell', r: d.r }, true); break;
    case 'paper': case 'co': case 'menu': sheet = { type: d.act }; render(); break;
    case 'close': sheet = null; render(); break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([serialize(state)], { type: 'application/json' }));
      a.download = `real-monopoly-day${state.day}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
    case 'import': $('#file').click(); break;
    case 'reset':
      if (state.phase !== 'over' && !confirm('放弃当前这一局？')) break;
      state = null; sheet = null; persist(); render();
      break;
  }
});

$('#file').addEventListener('change', async ev => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const s = parse(await f.text());
    s.player.name = clean(s.player.name) || '无名公司';
    state = s; sheet = null; persist(); render();
  } catch { toast('存档无法读取'); }
});

(async () => {
  try {
    data = Object.fromEntries(await Promise.all(FILES.map(async n => [n, await (await fetch(`data/${n}.json`)).json()])));
    state = load(localStorage);
    render();
  } catch { $('#app').textContent = '数据加载失败'; }
})();
