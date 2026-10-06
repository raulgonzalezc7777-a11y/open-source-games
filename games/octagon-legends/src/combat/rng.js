// Small seeded PRNG (mulberry32). The whole combat sim draws randomness from
// instances of this so a fight is reproducible given a seed and the inputs.

export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.chance = (p) => next() < p;
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  // Weighted pick from [[item, weight], ...]
  next.weighted = (pairs) => {
    let total = 0;
    for (const [, w] of pairs) total += Math.max(0, w);
    let r = next() * total;
    for (const [item, w] of pairs) {
      r -= Math.max(0, w);
      if (r <= 0) return item;
    }
    return pairs[pairs.length - 1][0];
  };
  // Roughly normal (sum of uniforms), mean 0, sd ~ 1
  next.gauss = () => (next() + next() + next() + next() - 2) * 1.732;
  return next;
}
