import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('Folk faction', () => {
  test('when a Folk unit dies, a random surviving Folk gets +1 ATK', () => {
    const result = runBattle({
      player: [
        makeUnit('f1', { class: 'Grunt', faction: 'Folk', hp: 1, atk: 1 }),
        makeUnit('f2', { class: 'Grunt', faction: 'Folk', hp: 10, atk: 1 }),
        makeUnit('f3', { class: 'Grunt', faction: 'Folk', hp: 10, atk: 1 }),
      ],
      enemy: [makeUnit('killer', { hp: 50, atk: 5 })],
      seed: 1,
    });
    const buffs = result.log.ofKind('folk_death_buff');
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs[0].newAtk).toBe(2);
  });

  test('fizzles when no Folk survivors remain', () => {
    const result = runBattle({
      player: [
        makeUnit('f1', { class: 'Grunt', faction: 'Folk', hp: 1, atk: 0 }),
      ],
      enemy: [makeUnit('killer', { hp: 50, atk: 5 })],
      seed: 2,
    });
    const fizzles = result.log.ofKind('folk_death_buff_fizzle');
    expect(fizzles.length).toBe(1);
  });
});

describe('Robot faction', () => {
  test('each Robot gains +1 HP per other Robot at battle start', () => {
    const result = runBattle({
      player: [
          // Use Tank class (no initialize) to avoid stacking Grunt class HP bonus.
        makeUnit('r1', { class: 'Tank', faction: 'Robot', hp: 3, atk: 1 }),
        makeUnit('r2', { class: 'Tank', faction: 'Robot', hp: 3, atk: 1 }),
        makeUnit('r3', { class: 'Tank', faction: 'Robot', hp: 3, atk: 1 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 3,
    });
    const inits = result.log.ofKind('robot_hp_init');
    expect(inits.length).toBe(3);
    for (const i of inits) {
      // Each Robot sees 2 others -> +2 HP
      expect(i.otherRobots).toBe(2);
      expect(i.newHp).toBe(5);
    }
  });

  test('solo Robot gets no HP bonus', () => {
    const result = runBattle({
      player: [makeUnit('r1', { class: 'Grunt', faction: 'Robot', hp: 3, atk: 1 })],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 4,
    });
    expect(result.log.ofKind('robot_hp_init').length).toBe(0);
  });
});
