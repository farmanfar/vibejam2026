import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('Grunt class', () => {
  test('3 Grunts: +3 HP each at battle start', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g2', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g3', { class: 'Grunt', hp: 2, atk: 1 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 1,
    });
    const inits = result.log.ofKind('grunt_synergy_init');
    expect(inits.length).toBe(3);
    for (const i of inits) {
      expect(i.bonusHp).toBe(3);
      expect(i.bonusAtk).toBe(0);
    }
  });

  test('5 Grunts: +3 HP and +3 ATK each', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g2', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g3', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g4', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g5', { class: 'Grunt', hp: 2, atk: 1 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 2,
    });
    const inits = result.log.ofKind('grunt_synergy_init');
    expect(inits.length).toBe(5);
    for (const i of inits) {
      expect(i.bonusHp).toBe(3);
      expect(i.bonusAtk).toBe(3);
    }
  });

  test('2 Grunts: no bonus', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Grunt', hp: 2, atk: 1 }),
        makeUnit('g2', { class: 'Grunt', hp: 2, atk: 1 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 3,
    });
    const inits = result.log.ofKind('grunt_synergy_init');
    expect(inits.length).toBe(0);
  });
});

describe('Berserker class', () => {
  test('3 Berserkers: +3 ATK each at battle start', () => {
    const result = runBattle({
      player: [
        makeUnit('b1', { class: 'Berserker', hp: 3, atk: 2 }),
        makeUnit('b2', { class: 'Berserker', hp: 3, atk: 2 }),
        makeUnit('b3', { class: 'Berserker', hp: 3, atk: 2 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 4,
    });
    const inits = result.log.ofKind('berserker_synergy_init');
    expect(inits.length).toBe(3);
    for (const i of inits) expect(i.newAtk).toBe(5);
  });

  test('2 Berserkers: no bonus', () => {
    const result = runBattle({
      player: [
        makeUnit('b1', { class: 'Berserker', hp: 3, atk: 2 }),
        makeUnit('b2', { class: 'Berserker', hp: 3, atk: 2 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 5,
    });
    expect(result.log.ofKind('berserker_synergy_init').length).toBe(0);
  });
});

describe('Gunner class', () => {
  test('3 Gunners: startup volley at battle start to highest-slot enemy', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Gunner', hp: 5, atk: 1 }),
        makeUnit('g2', { class: 'Gunner', hp: 5, atk: 1 }),
        makeUnit('g3', { class: 'Gunner', hp: 5, atk: 1 }),
      ],
      enemy: [
        makeUnit('e0', { hp: 5, atk: 0 }),
        makeUnit('e1', { hp: 5, atk: 0 }),
      ],
      seed: 6,
    });
    const shots = result.log.ofKind('gunner_startup_shot');
    expect(shots.length).toBe(3);
    for (const s of shots) expect(s.target).toBe('e1');
  });

  test('2 Gunners: no startup volley', () => {
    const result = runBattle({
      player: [
        makeUnit('g1', { class: 'Gunner', hp: 5, atk: 1 }),
        makeUnit('g2', { class: 'Gunner', hp: 5, atk: 1 }),
      ],
      enemy: [makeUnit('e', { hp: 5, atk: 0 })],
      seed: 7,
    });
    expect(result.log.ofKind('gunner_startup_shot').length).toBe(0);
  });
});
