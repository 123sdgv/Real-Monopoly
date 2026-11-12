// 环形轨道：7×7 网格的外圈 24 格，中间是骰子和待办。
import { icon, dice } from './icons.js';
import { chips, scale } from './handView.js';
import { harm } from '../engine/company.js';

const at = i => (i < 7 ? [1, i + 1] : i < 13 ? [i - 5, 7] : i < 19 ? [7, 19 - i] : [25 - i, 1]);
const TILE = { rest: '休息', gen: '事件', ind: '行业', dil: '抉择' };

// ui.pos：走格动画进行中，棋子暂时停在哪一格；ui.rolling：骰子还在转
export function boardHTML(s, data, ui = {}) {
  const p = s.player, pos = ui.pos ?? p.pos, ridx = id => data.regions.findIndex(r => r.id === id);
  const tiles = data.config.board.map((t, i) => {
    const [row, col] = at(i), r = t.startsWith('reg:') ? t.slice(4) : null;
    const cls = r ? `t-reg r${ridx(r)} ${Math.max(s.world.regions[r].unrest, s.world.regions[r].ban) >= s.day ? 'unrest' : ''}` : 't-' + t;
    return `<div class="tile ${cls} ${i === pos ? 'here' : ''}" data-i="${i}" title="${r ? data.regions[ridx(r)].name : TILE[t]}" style="grid-area:${row}/${col}">${icon(r ? 'reg' : t)}${
      r && p.sites[r] ? `<i class="n">${p.sites[r]}</i>` : ''}${i === pos ? '<b class="me"></b>' : ''}</div>`;
  }).join('');
  const roll = s.phase === 'roll';
  return `<div class="board">${tiles}<div class="hub">
    <button class="die ${roll ? 'live' : ''} ${ui.rolling ? 'rolling' : ''}" data-act="roll" aria-label="掷骰" ${roll ? '' : 'disabled'}>${dice(s.dice)}</button>
    <div class="legend">${data.regions.map((r, i) => `<span class="tag r${i}">${r.name}<b class="num">${p.sites[r.id]}</b></span>`).join('')}</div>
    ${s.todo ? `<div class="todo">${icon('warn')}<b>${s.todo.t}</b><em class="num">Lv${s.todo.lvl}</em><span>${icon('end')}${chips(scale(s.todo.fx, harm(s, data)), data)}</span></div>` : ''}
  </div></div>`;
}
