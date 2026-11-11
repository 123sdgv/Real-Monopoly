// 环形棋盘：7×7 网格的外圈 24 格。
import { icon, dice } from './icons.js';
import { chips } from './handView.js';

const at = i => (i < 7 ? [1, i + 1] : i < 13 ? [i - 5, 7] : i < 19 ? [7, 19 - i] : [25 - i, 1]);

export function boardHTML(s, data) {
  const p = s.player, ridx = id => data.regions.findIndex(r => r.id === id);
  const tiles = data.config.board.map((t, i) => {
    const [row, col] = at(i), r = t.startsWith('reg:') ? t.slice(4) : null;
    const cls = r ? `t-reg r${ridx(r)} ${s.world.regions[r].unrest >= s.day ? 'unrest' : ''}` : 't-' + t;
    return `<div class="tile ${cls} ${i === p.pos ? 'here' : ''}" style="grid-area:${row}/${col}">${icon(r ? 'reg' : t)}${
      r && p.sites[r] ? `<i class="n">${p.sites[r]}</i>` : ''}${i === p.pos ? '<b class="me"></b>' : ''}</div>`;
  }).join('');
  const roll = s.phase === 'roll';
  return `<div class="board">${tiles}<div class="hub">
    <button class="die ${roll ? 'live' : ''}" data-act="roll" ${roll ? '' : 'disabled'}>${dice(s.dice)}</button>
    <div class="legend">${data.regions.map((r, i) => `<span class="tag r${i}">${r.name}<b class="num">${p.sites[r.id]}</b></span>`).join('')}</div>
    ${s.todo ? `<div class="todo">${icon('warn')}<b>${s.todo.t}</b><em class="num">Lv${s.todo.lvl}</em><span>${icon('end')}${chips(s.todo.fx, data)}</span></div>` : ''}
  </div></div>`;
}
