// 无界面跑 N 局：node test/sim.mjs [局数]
import { readFileSync } from 'node:fs';
import { newGame } from '../js/engine/state.js';
import { step } from '../js/engine/day.js';
import { parse, serialize } from '../js/engine/save.js';

const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const data = Object.fromEntries(['config', 'cards', 'events', 'dilemmas', 'regions', 'industries', 'headlines'].map(n => [n, load(n)]));
const N = +process.argv[2] || 1000;
const c = data.config;

function playGame(seed) {
  let s = newGame(data, seed, { name: '模拟公司', industry: data.industries[seed % 3].id });
  const st = { flips: 0, suppressed: 0, omens: 0 };
  const act = a => {
    const r = step(s, a, data);
    s = r.state;
    for (const l of r.log) if (l.type === 'flip') st.flips++;
    return r.log[0]?.type !== 'error';
  };
  let guard = 0;
  while (s.phase !== 'over') {
    if (++guard > 20000) throw new Error(`stuck seed=${seed} day=${s.day} phase=${s.phase}`);
    if (s.pending) {
      const n = s.pending.opts.length, k = (seed + s.day) % n;
      let ok = false;
      for (let j = 0; j < n && !ok; j++) ok = act({ type: 'choose', i: (k + j) % n });
      if (!ok) throw new Error(`no affordable option seed=${seed} ${s.pending.t}`);
    } else if (s.phase === 'paper') {
      if (!s.paper.head.title || /[{}]|undefined/.test([s.paper.head.title, ...s.paper.items.map(x => x.title), ...s.paper.small].join('|'))) throw new Error('bad paper ' + JSON.stringify(s.paper));
      st.omens += s.paper.small.length;
      act({ type: 'start' });
    } else if (s.phase === 'roll') act({ type: 'roll' });
    else if (s.phase === 'act') {
      const before = s.ledger.length;
      for (const from of ['hole', 'hand'])
        for (let i = s[from].length - 1; i >= 0; i--)
          act({ type: 'play', from, i, arg: data.regions[(seed + i) % 3].id }) || act({ type: 'play', from, i, arg: 'ops' });
      st.suppressed += Math.max(0, s.ledger.length - before);
      while (s.hand.length > c.handMax) act({ type: 'discard', i: 0 });
      if (s.day === 30) s = parse(serialize(s)); // 存档往返
      act({ type: 'end' });
    }
    const p = s.player;
    for (const k of ['cash', 'fame', 'control', 'debt']) if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`bad ${k}=${p[k]} seed=${seed} day=${s.day}`);
  }
  if (s.day !== c.days) throw new Error('wrong end day ' + s.day);
  return { s, st };
}

const t0 = Date.now();
let worth = 0, wins = 0, flips = 0, sup = 0;
for (let i = 1; i <= N; i++) {
  const { s, st } = playGame(i * 7919);
  worth += s.result.worth; wins += s.result.win; flips += st.flips; sup += st.suppressed;
}
const a = serialize(playGame(42).s), b = serialize(playGame(42).s);
if (a !== b) throw new Error('同种子结果不一致');
console.log(`${N} 局 OK  ${Date.now() - t0}ms`);
console.log(`平均身价 ${Math.round(worth / N)}  达标率 ${(100 * wins / N).toFixed(1)}%（阈值 ${c.win}）`);
console.log(`每局压下 ${(sup / N).toFixed(1)} 次  暗账翻出 ${(flips / N).toFixed(1)} 次  同种子可复现 ✓`);
