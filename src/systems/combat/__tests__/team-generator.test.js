import { describe, test, expect } from 'vitest';
import { stampTeam, randomTeam, themedTeam, allPairs, RNG } from '../../../../scripts/lib/team-generator.mjs';

// Minimal unit def factory
function u(id, tier = 1, cls = 'Grunt', faction = 'Folk') {
  return { id, tier, class: cls, faction, hp: 3, atk: 1 };
}

const POOL = [
  u('a', 0, 'Ancient',   'Folk'),
  u('b', 1, 'Ancient',   'Monster'),
  u('c', 2, 'Knight',    'Robot'),
  u('d', 1, 'Gunner',    'Folk'),
  u('e', 0, 'Berserker', 'Monster'),
];

describe('team-generator', () => {
  test('stampTeam returns new objects with unique _instanceId per slot and does not mutate input', () => {
    const defs = [u('x'), u('y')];
    const origIds = defs.map((d) => d._instanceId);
    const stamped = stampTeam(defs, 'p');

    // New objects
    expect(stamped[0]).not.toBe(defs[0]);
    expect(stamped[1]).not.toBe(defs[1]);
    // Original untouched
    expect(defs[0]._instanceId).toBe(origIds[0]);
    expect(defs[1]._instanceId).toBe(origIds[1]);
    // Stamped ids are unique
    expect(stamped[0]._instanceId).toBe('x#p0');
    expect(stamped[1]._instanceId).toBe('y#p1');
    expect(stamped[0]._instanceId).not.toBe(stamped[1]._instanceId);
  });

  test('randomTeam with uniqueIds:true produces no duplicate ids', () => {
    const rng = new RNG(1);
    const team = randomTeam({ size: 3, pool: POOL, rng, uniqueIds: true, teamId: 'p' });
    const ids = team.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
  });

  test('randomTeam with uniqueIds:false allows duplicate ids', () => {
    // Pool of 1 — duplicates guaranteed when size > 1
    const tinyPool = [u('solo')];
    const rng = new RNG(1);
    const team = randomTeam({ size: 3, pool: tinyPool, rng, uniqueIds: false, teamId: 'p' });
    expect(team).toHaveLength(3);
    const ids = team.map((d) => d.id);
    expect(ids.every((id) => id === 'solo')).toBe(true);
  });

  test('randomTeam with maxTier:1 produces only tier <= 1 units', () => {
    const rng = new RNG(1);
    const team = randomTeam({ size: 5, pool: POOL, rng, maxTier: 1, teamId: 'p' });
    for (const def of team) {
      expect(def.tier).toBeLessThanOrEqual(1);
    }
  });

  test('themedTeam class:Ancient returns only Ancient-class units when pool supports it', () => {
    const ancientPool = POOL.filter((u) => u.class === 'Ancient'); // 'a', 'b'
    const rng = new RNG(42);
    const team = themedTeam({
      theme: 'class:Ancient',
      pool: ancientPool,
      fillerPool: POOL,
      rng,
      size: 2,
      teamId: 'p',
    });
    expect(team).toHaveLength(2);
    for (const def of team) {
      expect(def.class).toBe('Ancient');
    }
  });

  test('themedTeam falls back to fillerPool when theme pool is exhausted', () => {
    const tinyThemed = [u('solo_ancient', 0, 'Ancient', 'Folk')];
    const rng = new RNG(1);
    const team = themedTeam({
      theme: 'class:Ancient',
      pool: tinyThemed,
      fillerPool: POOL,
      rng,
      size: 4,       // more than 1 Ancient available
      teamId: 'p',
    });
    expect(team).toHaveLength(4);
    // First pick is always the solo Ancient; rest are filler
    expect(team[0].class).toBe('Ancient');
  });

  test('same RNG seed produces identical randomTeam output', () => {
    const team1 = randomTeam({ size: 3, pool: POOL, rng: new RNG(7), teamId: 'p' });
    const team2 = randomTeam({ size: 3, pool: POOL, rng: new RNG(7), teamId: 'p' });
    expect(team1.map((d) => d.id)).toEqual(team2.map((d) => d.id));
  });

  test('allPairs over 3-unit pool yields exactly 9 pairs', () => {
    const small = [u('x'), u('y'), u('z')];
    const pairs = [...allPairs({ pool: small, teamSize: 1 })];
    expect(pairs).toHaveLength(9);
  });

  test('allPairs pairs are freshly stamped', () => {
    const small = [u('x'), u('y')];
    for (const [player, enemy] of allPairs({ pool: small, teamSize: 1 })) {
      expect(player[0]._instanceId).toMatch(/^[xy]#p0$/);
      expect(enemy[0]._instanceId).toMatch(/^[xy]#e0$/);
    }
  });
});
