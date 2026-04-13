// Seeded Mulberry32 PRNG. Deterministic across runs for a given seed.
// Used for every roll in CombatCore: faction procs, class procs, Gnat bites,
// Ghoul reanimate, Toxic Cascade, coin-flips. Never use Math.random in combat.

export class RNG {
  constructor(seed) {
    if (typeof seed !== 'number' || !Number.isFinite(seed)) {
      throw new Error(`[RNG] seed must be a finite number, got ${seed}`);
    }
    this._state = seed >>> 0;
    this._initialSeed = this._state;
    this._calls = 0;
  }

  next() {
    this._calls++;
    let t = (this._state = (this._state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(this.next() * arr.length)];
  }

  get seed() {
    return this._initialSeed;
  }

  get calls() {
    return this._calls;
  }
}
