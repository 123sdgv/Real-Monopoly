// 状态定义与初始化。整个状态是纯 JSON，可直接存档。
import { makePaper } from './paper.js';

export const VERSION = 1;

export function newGame(data, seed, opts = {}) {
  const c = data.config;
  const s = {
    v: VERSION, seed: seed >>> 0, rng: seed >>> 0,
    day: 1, phase: 'paper', ap: c.ap, dice: 0,
    player: {
      name: opts.name || '无名公司', industry: opts.industry || data.industries[0].id, status: 'ceo',
      cash: c.start.cash, control: c.start.control, fame: c.start.fame,
      debt: 0, valBonus: 0, pos: 0, shield: 0, sites: {}, lean: {},
    },
    hand: [], hole: [], cooldown: {}, netPenalty: 0,
    pending: null, inbox: [], todo: null,
    ledger: [], queue: [], rewrites: [],
    news: [{ k: 'open', w: 9, mine: true }],
    world: { regions: {}, industries: {} },
    paper: null, result: null,
  };
  for (const r of data.regions) {
    s.world.regions[r.id] = { stability: r.stability, acceptance: r.acceptance, unrest: 0 };
    s.player.sites[r.id] = 0;
  }
  for (const i of data.industries) s.world.industries[i.id] = { boom: i.boom, regulation: i.regulation, prev: i.boom };
  s.paper = makePaper(s, data);
  s.news = [];
  return s;
}
