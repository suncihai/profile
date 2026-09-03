/**
 * Tiny deterministic PRNG (mulberry32).
 *
 * Used for the pre-generated glass silhouettes so the set of shapes shipped to
 * every visitor is identical and reviewable, while runtime choices (which zone,
 * which jitter, which fragment velocity) stay on Math.random.
 */
export type Rng = () => number

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randRange(min: number, max: number, rng: Rng = Math.random): number {
  return min + rng() * (max - min)
}

/** Random integer in [min, max]. */
export function randInt(min: number, max: number, rng: Rng = Math.random): number {
  return Math.floor(min + rng() * (max - min + 1))
}
