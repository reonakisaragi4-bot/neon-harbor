// Neon Harbor — deterministic seeded random numbers (mulberry32).
// Every staged screenshot and every fresh city uses one seed, so a scene
// can be rebuilt exactly. Nothing here touches the network or the DOM.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    // Fisher-Yates shuffle of a copy: the original array keeps its order.
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    // Gaussian-ish pick around a centre, clamped to [min, max].
    bell(min, max, centre) {
      const v = (next() + next() + next()) / 3;
      const c = centre === undefined ? (min + max) / 2 : centre;
      const spread = (max - min) / 2;
      return Math.max(min, Math.min(max, c + (v - 0.5) * 2 * spread));
    },
  };
}

// A tiny string hash so a word seed ("harbor") becomes a number seed.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
