import { describe, test, expect } from 'vitest';
import {
  compactTeam,
  frontmostAliveEnemy,
  enemiesWithinRange,
  alliesBehindWithinRange,
  highestSlotAliveEnemy,
  sortBySlot,
  MAX_SLOTS,
} from '../position.js';

function mkUnit(id, slot, alive = true, team = 'player') {
  return { unitId: id, slot, alive, team };
}

function mkCtx(player, enemy) {
  return {
    teams: {
      player: { id: 'player', slots: player },
      enemy: { id: 'enemy', slots: enemy },
    },
    ownTeamOf: (u) => (u.team === 'player' ? { slots: player } : { slots: enemy }),
    enemyTeamOf: (u) => (u.team === 'player' ? { slots: enemy } : { slots: player }),
  };
}

describe('position helpers', () => {
  test('compactTeam removes dead units and re-stamps slot indices', () => {
    const team = {
      slots: [mkUnit('a', 0, true), mkUnit('b', 1, false), mkUnit('c', 2, true)],
    };
    const changed = compactTeam(team);
    expect(changed).toBe(true);
    expect(team.slots.map((u) => u.unitId)).toEqual(['a', 'c']);
    expect(team.slots.map((u) => u.slot)).toEqual([0, 1]);
  });

  test('frontmostAliveEnemy returns slot 0 of enemy team', () => {
    const p = [mkUnit('p0', 0)];
    const e = [mkUnit('e0', 0), mkUnit('e1', 1)];
    const ctx = mkCtx(p, e);
    expect(frontmostAliveEnemy(p[0], ctx).unitId).toBe('e0');
  });

  test('enemiesWithinRange returns up to N enemies from slot 0', () => {
    const p = [mkUnit('p0', 0)];
    const e = [
      mkUnit('e0', 0),
      mkUnit('e1', 1),
      mkUnit('e2', 2),
      mkUnit('e3', 3),
    ];
    const ctx = mkCtx(p, e);
    const r2 = enemiesWithinRange(p[0], 2, ctx);
    expect(r2.map((u) => u.unitId)).toEqual(['e0', 'e1']);
  });

  test('alliesBehindWithinRange returns only units behind with slot-distance <= range', () => {
    const p = [
      mkUnit('p0', 0),
      mkUnit('p1', 1),
      mkUnit('p2', 2),
      mkUnit('p3', 3),
      mkUnit('p4', 4),
    ];
    const ctx = mkCtx(p, []);
    // From slot 1, allies at slots 2 and 3 are within range 2. slot 4 is
    // distance 3 — out of range.
    const out = alliesBehindWithinRange(p[1], 2, ctx);
    expect(out.map((u) => u.unitId)).toEqual(['p2', 'p3']);
  });

  test('highestSlotAliveEnemy finds the furthest-back alive enemy', () => {
    const p = [mkUnit('p0', 0)];
    const e = [
      mkUnit('e0', 0),
      mkUnit('e1', 1, false),
      mkUnit('e2', 2),
    ];
    const ctx = mkCtx(p, e);
    expect(highestSlotAliveEnemy(p[0], ctx).unitId).toBe('e2');
  });

  test('sortBySlot sorts by increasing slot index', () => {
    const units = [mkUnit('c', 2), mkUnit('a', 0), mkUnit('b', 1)];
    const sorted = sortBySlot(units);
    expect(sorted.map((u) => u.unitId)).toEqual(['a', 'b', 'c']);
  });

  test('MAX_SLOTS is 5', () => {
    expect(MAX_SLOTS).toBe(5);
  });
});
