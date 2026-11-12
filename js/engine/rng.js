// 带种子的随机数。状态存在 s.rng 里，随存档走，同种子同结果。
export function next(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const int = (s, a, b) => a + Math.floor(next(s) * (b - a + 1));
export const chance = (s, p) => next(s) < p;
export const pick = (s, arr) => arr[Math.floor(next(s) * arr.length)];
export function weighted(s, arr, w) {
  const ws = arr.map(w);
  let r = next(s) * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) if ((r -= ws[i]) < 0) return arr[i];
  return arr[arr.length - 1];
}
export function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(s, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
