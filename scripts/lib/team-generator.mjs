// Team composition helpers for the balance sim.
// All functions accept a seeded RNG (src/systems/combat/RNG.js) so output is
// deterministic. Never use Math.random() here.
//
// Instance-id format: `${def.id}#${teamId}${slot}` — e.g. ghoul#p0, archer#e3.
// This matches the convention used by BattleSceneAdapter.

import { RNG } from '../../src/systems/combat/RNG.js';

/**
 * Stamp _instanceId on a copy of each def. Does NOT mutate the input array or objects.
 * teamId should be 'p' for player and 'e' for enemy.
 * @param {object[]} defs
 * @param {string}   teamId
 * @returns {object[]}
 */
export function stampTeam(defs, teamId) {
  return defs.map((def, slot) => ({ ...def, _instanceId: `${def.id}#${teamId}${slot}` }));
}

/**
 * Pick a random team of `size` units from the pool using the supplied RNG.
 * `uniqueIds=false` (default, SAP-style): duplicate unit ids are allowed across slots.
 * `uniqueIds=true`: no two slots share the same unit id.
 * `maxTier`: if set, only units with tier <= maxTier are eligible.
 * Returns stamped defs ready to pass to CombatCore.run().
 *
 * @param {{size?:number, pool:object[], rng:RNG, maxTier?:number|null, uniqueIds?:boolean, teamId:string}} opts
 * @returns {object[]}
 */
export function randomTeam({ size = 5, pool, rng, maxTier = null, uniqueIds = false, teamId }) {
  let eligible = maxTier != null ? pool.filter((u) => u.tier <= maxTier) : [...pool];
  if (eligible.length === 0) {
    throw new Error(`[Gen] randomTeam: pool is empty after tier filter (maxTier=${maxTier})`);
  }

  const chosen = [];
  const usedIds = new Set();

  for (let i = 0; i < size; i++) {
    let candidates = uniqueIds ? eligible.filter((u) => !usedIds.has(u.id)) : eligible;
    if (candidates.length === 0) {
      // Fall back to full pool (with or without tier filter) if we've exhausted unique ids
      candidates = eligible;
    }
    const pick = rng.pick(candidates);
    chosen.push(pick);
    if (uniqueIds) usedIds.add(pick.id);
  }

  return stampTeam(chosen, teamId);
}

/**
 * Build a themed team.
 * Themes:
 *   'mixed'        — purely random (same as randomTeam with no constraints)
 *   'class:<X>'    — as many units of class X as pool allows, fill with fillerPool
 *   'faction:<X>'  — same for faction
 *   'balanced-2-2-1' — 2 units from class A, 2 from class B, 1 random (first two classes found)
 *
 * @param {{theme:string, pool:object[], fillerPool:object[], rng:RNG, size?:number, teamId:string}} opts
 * @returns {object[]}
 */
export function themedTeam({ theme, pool, fillerPool, rng, size = 5, teamId }) {
  if (theme === 'mixed') {
    return randomTeam({ size, pool, rng, teamId });
  }

  if (theme.startsWith('class:')) {
    const cls = theme.slice(6);
    return _fillThemed(pool.filter((u) => u.class === cls), fillerPool, size, rng, teamId);
  }

  if (theme.startsWith('faction:')) {
    const fac = theme.slice(8);
    return _fillThemed(pool.filter((u) => u.faction === fac), fillerPool, size, rng, teamId);
  }

  if (theme === 'balanced-2-2-1') {
    const classes = [...new Set(pool.map((u) => u.class))];
    if (classes.length < 2) {
      return randomTeam({ size, pool, rng, teamId });
    }
    const clsA = classes[0];
    const clsB = classes[1];
    const poolA = pool.filter((u) => u.class === clsA);
    const poolB = pool.filter((u) => u.class === clsB);
    const filler = fillerPool ?? pool;
    const picks = [
      rng.pick(poolA) ?? rng.pick(filler),
      rng.pick(poolA) ?? rng.pick(filler),
      rng.pick(poolB) ?? rng.pick(filler),
      rng.pick(poolB) ?? rng.pick(filler),
      rng.pick(filler),
    ].filter(Boolean).slice(0, size);
    while (picks.length < size) picks.push(rng.pick(filler));
    return stampTeam(picks, teamId);
  }

  throw new Error(`[Gen] themedTeam: unknown theme "${theme}"`);
}

/**
 * Generator that yields [playerDefs, enemyDefs] for every ordered (a, b) pair from pool,
 * including mirrors (a vs a). teamSize=1 produces 1v1s for the matchup matrix.
 * Each pair is freshly stamped.
 *
 * @param {{pool:object[], teamSize?:number}} opts
 * @yields {[object[], object[]]}
 */
export function* allPairs({ pool, teamSize = 1 }) {
  for (const a of pool) {
    for (const b of pool) {
      const playerDefs = stampTeam(Array.from({ length: teamSize }, () => a), 'p');
      const enemyDefs  = stampTeam(Array.from({ length: teamSize }, () => b), 'e');
      yield [playerDefs, enemyDefs];
    }
  }
}

// ---------- internal ----------

function _fillThemed(themed, fillerPool, size, rng, teamId) {
  const picks = [];
  const available = [...themed];
  const filler = fillerPool ?? [];

  for (let i = 0; i < size; i++) {
    if (available.length > 0) {
      picks.push(rng.pick(available));
    } else if (filler.length > 0) {
      picks.push(rng.pick(filler));
    } else {
      throw new Error('[Gen] _fillThemed: ran out of units and no filler pool available');
    }
  }

  return stampTeam(picks, teamId);
}

export { RNG };
