// 新闻与人物的公共小工具。标题一旦定稿就不再变，"因你而变"的清单直接记定稿。
import { pick } from './rng.js';

const nm = (list, id) => list.find(x => x.id === id)?.name || '';

// 套模板。v: t n who r(地区 id) i(行业 id)
export function fill(s, data, k, v = {}) {
  const H = data.headlines, x = { ...v, co: s.player.name, r: nm(data.regions, v.r), i: nm(data.industries, v.i) };
  return pick(s, H[k] || H.ev).replace(/\{(\w+)\}/g, (_, a) => x[a] ?? '');
}

// 立刻定稿的新闻。mine：玩家造成的；mark：记入"因你而变"
export function report(s, data, k, v = {}, w = 3, mine = false, mark = false) {
  const title = fill(s, data, mine && data.headlines[k + '_me'] ? k + '_me' : k, v);
  s.news.push({ title, w, mine });
  if (mark) s.rewrites.push({ day: s.day, k, title });
  return title;
}

// 一个人在意什么：官员跟着所在地区走
export const caresOf = (data, P) => P.cares || data.regions.find(r => r.id === P.region).cares;
export const hidden = (s, data, P) => caresOf(data, P).filter(t => !s.known[P.id].includes(t));
