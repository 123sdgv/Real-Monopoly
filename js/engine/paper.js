// 报纸生成：模板 + 变量。头版是昨天最大的事，小字栏藏着前兆。
import { pick, shuffle } from './rng.js';

export function makePaper(s, data) {
  const H = data.headlines, p = s.player;
  const name = (list, id) => list.find(x => x.id === id)?.name || '';
  const line = n => {
    const k = n.mine && H[n.k + '_me'] ? n.k + '_me' : n.k;
    const v = { co: p.name, t: n.t, n: n.n, r: name(data.regions, n.r), i: name(data.industries, n.i) };
    return pick(s, H[k] || H.ev).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  };
  const news = s.news.slice().sort((a, b) => b.w - a.w).map(n => ({ title: line(n), mine: !!n.mine }));

  const small = [];
  for (const q of s.queue) {
    if (!q.omen) continue;
    if (q.seen) small.push(line({ k: 'seen_' + q.k, r: q.r, i: q.i, n: q.due - s.day + 1 }));
    else if (!q.said) { q.said = 1; small.push(line({ k: 'omen_' + q.k, r: q.r, i: q.i })); }
  }
  const fill = shuffle(s, H.filler.slice()).slice(0, 3);
  small.push(...fill);
  shuffle(s, small);

  const ind = data.industries.map(x => {
    const w = s.world.industries[x.id], d = w.boom - (w.prev ?? w.boom);
    w.prev = w.boom;
    return { id: x.id, name: x.name, boom: w.boom, d };
  });
  return { day: s.day, head: news[0] || { title: pick(s, H.quiet), mine: false }, items: news.slice(1, 5), ind, small };
}
