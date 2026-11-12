// 报纸生成：模板 + 变量。头版是昨天最大的事，行业版有 NPC 动态，小字栏藏着前兆和口风。
import { chance, pick, shuffle } from './rng.js';
import { fill, hidden } from './news.js';
import { npcWorth } from './company.js';

export function makePaper(s, data) {
  const H = data.headlines, c = data.config;
  const line = n => n.title || fill(s, data, n.mine && H[n.k + '_me'] ? n.k + '_me' : n.k, n);
  const news = s.news.slice().sort((a, b) => b.w - a.w).map(n => ({ title: line(n), mine: !!n.mine }));

  const small = [];
  for (const q of s.queue) {
    if (!q.omen) continue;
    if (q.seen) small.push(line({ k: 'seen_' + q.k, r: q.r, i: q.i, n: q.due - s.day + 1 }));
    else if (!q.said) { q.said = 1; small.push(line({ k: 'omen_' + q.k, r: q.r, i: q.i })); }
  }
  const shy = data.people.filter(P => hidden(s, data, P).length);
  if (shy.length && chance(s, c.hint)) { // 报纸偶尔漏出某人在意什么，见报即算已知
    const P = pick(s, shy), t = pick(s, hidden(s, data, P));
    s.known[P.id].push(t);
    small.push(fill(s, data, 'hint', { who: P.name, t: c.tags[t] }));
  }
  // 世界事件留下的痕迹会永久混进小字栏
  const pool = H.filler.concat(Object.keys(s.flags).flatMap(f => H.after[f] || []));
  small.push(...shuffle(s, pool).slice(0, 3));
  shuffle(s, small);

  const ind = data.industries.map(x => {
    const w = s.world.industries[x.id], d = w.boom - (w.prev ?? w.boom);
    w.prev = w.boom;
    const co = data.npcs.filter(n => n.industry === x.id && s.npcs[n.id].alive).map(n => {
      const worth = npcWorth(s, data, n.id);
      return { name: n.name, worth, d: worth - s.npcs[n.id].prev };
    });
    return { id: x.id, name: x.name, boom: w.boom, d, co };
  });
  return { day: s.day, me: s.me, head: news[0] || { title: pick(s, H.quiet), mine: false }, items: news.slice(1, 5), ind, small };
}
