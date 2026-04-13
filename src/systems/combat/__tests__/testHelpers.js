// Shared test helpers for CombatCore tests. Lightweight unit builders
// for each test's specific needs. No shared state between tests.

import { buildRegistry, CombatCore } from '../index.js';

export function makeUnit(id, overrides = {}) {
  return {
    id,
    name: id,
    faction: 'Folk',
    class: 'Grunt',
    tier: 1,
    hp: 3,
    atk: 1,
    range: 1,
    ability_id: null,
    ...overrides,
  };
}

export function runBattle({ player, enemy, seed = 42 }) {
  const registry = buildRegistry();
  const core = new CombatCore({ registry, seed });
  return core.run({ player, enemy });
}

export function dumpLog(result) {
  return result.log.entries.map((e) => e.kind).join(',');
}
