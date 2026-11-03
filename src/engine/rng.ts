// rng.ts: a small seeded generator (mulberry32). Its whole state is one 32-bit
// integer kept in the game state, so a match replays exactly from its seed.

/** Turn any seed text into a 32-bit start state (FNV-1a). */
export function seedState(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Advance the state and return [next state, value in 0..2^32-1]. */
export function next(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, (t ^ (t >>> 14)) >>> 0];
}

/** A small holder the rules use while resolving one command. */
export class Dice {
  state: number;
  rolls: number[] = [];
  constructor(state: number) { this.state = state; }
  /** Uniform integer in 1..n. */
  roll(n = 6): number {
    const [s, v] = next(this.state);
    this.state = s;
    const r = (v % n) + 1;
    this.rolls.push(r);
    return r;
  }
  /** Uniform index in 0..n-1. */
  pick(n: number): number { return this.roll(n) - 1; }
}
