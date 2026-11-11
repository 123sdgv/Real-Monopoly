// 状态定义与初始化。整个状态是纯 JSON，可直接存档。
import { makePaper } from './paper.js';
import { npcWorth } from './company.js';
import { caresOf } from './news.js';

export const VERSION = 2;

export function newGame(data, seed, opts = {}) {
  const c = data.config;
  const s = {
    v: VERSION, seed: seed >>> 0, rng: seed >>> 0,
    day: 1, phase: 'paper', ap: c.ap, dice: 0,
    player: {
      name: opts.name || '无名公司', industry: opts.industry || data.industries[0].id, status: 'ceo',
      cash: c.start.cash, control: c.start.control, fame: c.start.fame,
      debt: 0, valBonus: 0, inc: 0, pos: 0, shield: 0, listed: false,
      sites: {}, stake: {}, lean: {}, n: {},
    },
    hand: [], hole: [], cooldown: {}, netPenalty: 0,
    pending: null, inbox: [], todo: null,
    ledger: [], queue: [], rewrites: [],
    // P2/P3：世界事件标记、玩家对各变量的累计推动、限时政策、空单、已看穿的标签、股东代表的信任、当晚重大负面数
    flags: {}, push: {}, policies: [], shorts: [], known: {}, trust: 0, strike: 0,
    npcs: {},
    news: [{ k: 'open', w: 9, mine: true }],
    world: { regions: {}, industries: {} },
    paper: null, result: null,
  };
  for (const r of data.regions) {
    s.world.regions[r.id] = { stability: r.stability, acceptance: r.acceptance, industry: r.industry, unrest: 0, ban: 0 };
    s.player.sites[r.id] = 0;
  }
  for (const i of data.industries) s.world.industries[i.id] = { boom: i.boom, regulation: i.regulation, prev: i.boom };
  for (const n of data.npcs) {
    s.npcs[n.id] = { cash: n.cash, val: n.val, debt: 0, listed: false, alive: true, ally: 0, allyV: 0, war: 0, prev: 0 };
    s.npcs[n.id].prev = npcWorth(s, data, n.id);
    s.player.stake[n.id] = 0;
  }
  for (const P of data.people) s.known[P.id] = caresOf(data, P).slice(0, P.open);
  s.paper = makePaper(s, data);
  s.news = [];
  return s;
}
