// Per-player game accuracy, ported from Chesskit's accuracy.ts (GPL-3.0), which
// follows Lichess's AccuracyPercent.scala: each move's accuracy from the win%
// it gave up, then a mix of a volatility-weighted mean and a harmonic mean.

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/** Accuracy of one move from the mover's win% before and after it (0-100). */
export const moveAccuracy = (before: number, after: number) => clamp(103.1668100711649 * Math.exp(-0.04354415386753951 * Math.max(0, before - after)) - 3.166924740191411 + 1, 0, 100);

/** `wins[i]` = White's win% at position i (0 = start). Returns null until every position is known. */
export function gameAccuracy(wins: (number | undefined)[]): { w: number; b: number } | null {
  if (wins.length < 3 || wins.some((x) => x === undefined)) return null;
  const wp = wins as number[];
  const size = clamp(Math.ceil(wp.length / 10), 2, 8);
  const half = Math.round(size / 2);
  const weights: number[] = [];
  for (let i = 1; i < wp.length; i++) {
    const win = i - half < 0 ? wp.slice(0, size) : i + half > wp.length ? wp.slice(-size) : wp.slice(i - half, i + half);
    weights.push(clamp(std(win), 0.5, 12));
  }
  const acc = wp.slice(1).map((after, i) => (i % 2 === 0 ? moveAccuracy(wp[i], after) : moveAccuracy(100 - wp[i], 100 - after)));
  const player = (r: number) => {
    const a = acc.filter((_, i) => i % 2 === r);
    const w = weights.filter((_, i) => i % 2 === r);
    if (!a.length) return 0;
    const weighted = a.reduce((s, x, i) => s + x * w[i], 0) / w.reduce((s, x) => s + x, 0);
    const harmonic = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 10), 0);
    return (weighted + harmonic) / 2;
  };
  return { w: player(0), b: player(1) };
}
