// 存档。store 是任何带 getItem/setItem/removeItem 的对象（浏览器里传 localStorage）。
import { VERSION } from './state.js';

const KEY = 'real-monopoly.save';

export const serialize = s => JSON.stringify(s);

export function parse(text) {
  const s = JSON.parse(text);
  if (!s || s.v !== VERSION || !s.player || !s.world || !s.npcs || !Number.isInteger(s.rng)) throw new Error('bad save');
  return s;
}

export const save = (store, s) => store.setItem(KEY, serialize(s));
export const clear = store => store.removeItem(KEY);
export function load(store) {
  try {
    const t = store.getItem(KEY);
    return t ? parse(t) : null;
  } catch {
    return null;
  }
}
