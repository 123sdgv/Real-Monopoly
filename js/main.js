// 外壳：加载数据、保存状态、把点击变成动作交给引擎、重画。动效只在这里和 CSS 里，引擎不知道。
import { newGame } from './engine/state.js';
import { step } from './engine/day.js';
import { clear, load, parse, save, serialize } from './engine/save.js';
import { paperHTML } from './ui/paperView.js';
import { deskHTML, startHTML } from './ui/pages.js';
import { overHTML, overText } from './ui/overView.js';
import { cardSheet, companySheet, eventSheet, helpSheet, negoSheet, npcSheet, worldSheet } from './ui/sheets.js';

const $ = q => document.querySelector(q);
const FILES = ['config', 'cards', 'events', 'dilemmas', 'regions', 'industries', 'headlines', 'npcs', 'people', 'world'];
const MSG = {
  ap: '行动点不足', cash: '现金不足', weak: '等级不够', target: '现在用不上', hand: '先弃牌', none: '没有可用的', region: '选一个地区',
  status: '这个身份做不了', active: '已在生效', small: '估值不够', cool: '刚谈过', control: '持股太少', max: '已到上限', nosite: '那里没有厂', ban: '被禁入', chip: '先选筹码',
  private: '还没上市',
};
const WHO = { ceo: '重掌公司', holder: '被罢免', out: '一无所有' };
const clean = t => String(t || '').replace(/[<>&"']/g, '').trim().slice(0, 8);
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let data, state = null, sheet = null, timer;
// 只属于界面的东西：走格动画里棋子的临时位置、骰子在转、刚抽到的牌、哪一天的报纸已经上过墨
const ui = { pos: null, rolling: false, fresh: [], busy: false, pressed: -1, arm: false };

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), 1400);
}
const store = (() => { try { return localStorage; } catch { return null; } })(); // 有的环境连碰都不让碰
const persist = () => { try { state ? save(store, state) : clear(store); } catch {} };

function render() {
  const over = state?.phase === 'over', paper = state?.phase === 'paper';
  const key = over ? 'over' : paper ? state.day : -1, press = (over || paper) && ui.pressed !== key; // 头条上墨每天只演一次
  if (over || paper) ui.pressed = key;
  $('#app').innerHTML = !state ? startHTML(data)
    : over ? overHTML(state, data, press)
    : paper ? paperHTML(state, data, true, press) : deskHTML(state, data, ui);
  const live = state && !over && !ui.busy;
  const html = sheet?.type === 'help' ? helpSheet() : !live ? '' : state.pending ? eventSheet(state, data)
    : !sheet ? '' : sheet.type === 'card' ? cardSheet(state, data, sheet.from, sheet.i)
    : sheet.type === 'co' ? companySheet(state, data)
    : sheet.type === 'world' ? worldSheet(state, data)
    : sheet.type === 'npc' ? npcSheet(state, data, sheet.id)
    : sheet.type === 'nego' ? negoSheet(state, data, sheet) : paperHTML(state, data, false);
  const el = $('#sheet'), locked = html && sheet?.type !== 'help' && state?.pending;
  el.innerHTML = html ? `<div class="back" ${locked ? '' : 'data-act="close"'}></div><div class="panel" role="dialog" aria-modal="true">${html}</div>` : '';
  el.hidden = !html;
}

// 顶栏三个数变了，就在数字下面飘一下差额
function flash(was) {
  for (const k of ['cash', 'control', 'fame']) {
    const d = state.player[k] - was[k], el = $(`.stat[data-k="${k}"]`);
    if (!d || !el) continue;
    el.dataset.d = (d > 0 ? '+' : '') + d;
    el.classList.add(d > 0 ? 'up' : 'dn');
  }
}

function dispatch(a, keep) {
  const r = step(state, a, data), e = r.log.find(l => l.type === 'error');
  if (e) return toast(MSG[e.msg] || e.msg);
  const moved = r.log.find(l => l.type === 'status'), deal = r.log.find(l => l.type === 'deal'), was = state.player;
  state = r.state;
  if (deal && !deal.ok) sheet.pick = []; // 没谈成：留在桌边，看看摸到了什么底
  else if (!keep || moved || deal) sheet = null;
  if (moved || deal) toast(moved ? WHO[moved.to] : deal.ok ? '谈成' : '没谈成');
  persist();
  ui.fresh = r.log.filter(l => l.type === 'draw').map(l => l.id);
  render();
  ui.fresh = [];
  flash(was);
  if (!sheet) window.scrollTo(0, 0);
}

// 掷骰：骰子转一下，棋子一格一格走过去，走到了事件才弹出来
function roll() {
  const from = state.player.pos, r = step(state, { type: 'roll' }, data), e = r.log.find(l => l.type === 'error');
  if (e) return toast(MSG[e.msg] || e.msg);
  state = r.state;
  persist();
  if (calm.matches) return render();
  const n = data.config.board.length;
  Object.assign(ui, { pos: from, rolling: true, busy: true });
  render();
  let k = 0;
  const hop = () => {
    if (k === state.dice) { Object.assign(ui, { pos: null, rolling: false, busy: false }); return render(); }
    const me = $('.me'), to = $(`.tile[data-i="${(from + ++k) % n}"]`);
    $('.tile.here')?.classList.remove('here');
    to.classList.add('here');
    to.append(me);
    me.classList.remove('hop');
    void me.offsetWidth; // 重新触发落子动画
    me.classList.add('hop');
    setTimeout(hop, k === state.dice ? 320 : 130);
  };
  setTimeout(hop, 480);
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled || ui.busy) return;
  const d = el.dataset;
  switch (d.act) {
    case 'ind':
      document.querySelectorAll('.pick').forEach(b => b.classList.toggle('on', b === el));
      break;
    case 'new': {
      const seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
      state = newGame(data, seed, { name: clean($('#name').value) || '无名公司', industry: $('.pick.on').dataset.id });
      persist(); render();
      window.scrollTo(0, 0);
      break;
    }
    case 'roll': roll(); break;
    case 'start': case 'end': dispatch({ type: d.act }); break;
    case 'choose': dispatch({ type: 'choose', i: +d.i }); break;
    case 'card': sheet = { type: 'card', from: d.from, i: +d.i }; render(); break;
    case 'play': dispatch({ type: 'play', from: sheet.from, i: sheet.i, arg: d.arg }); break;
    case 'discard': dispatch({ type: 'discard', i: sheet.i }); break;
    case 'sell': dispatch({ type: 'sell', r: d.r }, true); break;
    case 'paper': case 'co': case 'world': case 'help': sheet = { type: d.act }; render(); break;
    case 'npc': sheet = { type: 'npc', id: d.id }; render(); break;
    case 'nego': sheet = { type: 'nego', who: d.who, deal: d.deal, arg: d.arg, pick: [] }; render(); break;
    case 'chip': { // 最多两项，第三项顶掉最早的
      const k = sheet.pick.indexOf(d.id);
      if (k >= 0) sheet.pick.splice(k, 1); else sheet.pick = [...sheet.pick, d.id].slice(-2);
      render();
      break;
    }
    case 'deal': dispatch({ type: 'nego', who: sheet.who, deal: sheet.deal, arg: sheet.arg, chips: sheet.pick }, true); break;
    case 'stake': dispatch({ type: 'stake', id: d.id, n: +d.n }, true); break;
    case 'short': dispatch({ type: 'short', id: d.id }, true); break;
    case 'quit': // 连点两次才算数，不用系统弹窗
      if (ui.arm) { ui.arm = false; sheet = null; dispatch({ type: 'quit' }); }
      else { ui.arm = true; toast('再点一次，放弃这一局'); setTimeout(() => { ui.arm = false; }, 2500); }
      break;
    case 'close': sheet = null; render(); break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([serialize(state)], { type: 'application/json' }));
      a.download = `real-monopoly-day${state.day}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
    case 'copy':
      (navigator.clipboard?.writeText(overText(state)) ?? Promise.reject()).then(() => toast('已抄好'), () => toast('这里抄不了'));
      break;
    case 'import': $('#file').click(); break;
    case 'reset': state = null; sheet = null; persist(); render(); window.scrollTo(0, 0); break;
  }
});

document.addEventListener('keydown', ev => { // 电脑上：Esc 关弹层
  if (ev.key === 'Escape' && sheet && !(state?.pending && sheet.type !== 'help')) { sheet = null; render(); }
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
    state = store && load(store);
    render();
  } catch { $('#app').textContent = '数据加载失败'; }
})();
