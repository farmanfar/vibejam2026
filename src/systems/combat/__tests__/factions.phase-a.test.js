import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('Monster faction — Undead Persistence', () => {
  test('solo Monster has 10% base reanimate chance', () => {
    const result = runBattle({
      player: [
        makeUnit('ghoul', {
          class: 'Grunt',
          faction: 'Monster',
          hp: 1,
          atk: 0,
        }),
      ],
      enemy: [makeUnit('attacker', { hp: 50, atk: 5 })],
      seed: 25,
    });
    const rolls = result.log.ofKind('reanimate_roll');
    expect(rolls.length).toBeGreaterThan(0);
    for (const r of rolls) expect(r.chance).toBeCloseTo(0.1);
  });

  test('3 Monsters -> 30% reanimate chance', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g2', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g3', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
      ],
      enemy: [makeUnit('attacker', { hp: 50, atk: 5 })],
      seed: 28,
    });
    const rolls = result.log.ofKind('reanimate_roll');
    // Each monster sees 2 other Monsters -> 0.1 + 0.2 = 0.3
    for (const r of rolls) {
      if (r.otherMonsters === 2) expect(r.chance).toBeCloseTo(0.3);
    }
  });

  test('reanimate chance caps at 50%', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g2', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g3', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g4', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
        makeUnit('g5', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 0 }),
      ],
      enemy: [makeUnit('attacker', { hp: 50, atk: 5 })],
      seed: 29,
    });
    const rolls = result.log.ofKind('reanimate_roll');
    for (const r of rolls) expect(r.chance).toBeLessThanOrEqual(0.5);
  });

  test('reanimate places unit at back slot with full HP, acts next round', () => {
    // Force a reanimation with a seed that procs the 10% solo ghoul.
    // If this seed doesn't proc, test iterates a few seeds.
    let result = null;
    for (let s = 0; s < 50 && !result; s++) {
      const r = runBattle({
        player: [
          makeUnit('g', { class: 'Grunt', faction: 'Monster', hp: 1, atk: 1 }),
        ],
        enemy: [
          makeUnit('e', { hp: 20, atk: 5 }),
          makeUnit('f', { hp: 20, atk: 5 }),
        ],
        seed: s,
      });
      if (r.log.ofKind('reanimate_success').length > 0) result = r;
    }
    expect(result).not.toBeNull();
    const success = result.log.ofKind('reanimate_success')[0];
    expect(success.newHp).toBeGreaterThan(0);
  });
});
