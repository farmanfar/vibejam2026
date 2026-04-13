import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('CombatCore smoke', () => {
  test('single basic attacker kills a single target', () => {
    const result = runBattle({
      player: [makeUnit('p_hi_atk', { hp: 5, atk: 3 })],
      enemy: [makeUnit('e_frail', { hp: 1, atk: 1 })],
    });
    expect(result.winner).toBe('player');
    expect(result.rounds).toBeGreaterThan(0);
  });

  test('battle hits round cap and reports draw if neither side dies', () => {
    // Two 1-ATK Tanks with a low Tank count can still sometimes kill each
    // other. We make Tank count 1 on each side (10% block), but stretch HP
    // so neither dies in 200 rounds of 1-ATK trades.
    const result = runBattle({
      player: [makeUnit('p_wall', { hp: 9999, atk: 0, class: 'Grunt' })],
      enemy: [makeUnit('e_wall', { hp: 9999, atk: 0, class: 'Grunt' })],
      seed: 1,
    });
    expect(result.rounds).toBe(200);
    expect(result.winner).toBe('draw');
  });

  test('battle_init and battle_end always fire', () => {
    const result = runBattle({
      player: [makeUnit('a', { hp: 1, atk: 1 })],
      enemy: [makeUnit('b', { hp: 1, atk: 1 })],
      seed: 7,
    });
    expect(result.log.ofKind('battle_init').length).toBe(1);
    expect(result.log.ofKind('battle_end').length).toBe(1);
  });
});
