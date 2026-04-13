import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('poison + Toxic Cascade', () => {
  test('Assassin attack applies 1 poison stack per basic attack', () => {
    const result = runBattle({
      player: [
        makeUnit('assassin_test', { class: 'Assassin', atk: 1, hp: 5 }),
      ],
      enemy: [makeUnit('target', { hp: 20, atk: 0 })],
      seed: 2,
    });
    const poisonApplies = result.log.ofKind('apply_poison');
    expect(poisonApplies.length).toBeGreaterThan(0);
    // Each apply_poison should increment stacks by 1.
    for (const entry of poisonApplies) {
      expect(entry.after - entry.before).toBe(1);
    }
  });

  test('poison ticks 1 damage per stack per round', () => {
    const result = runBattle({
      player: [
        makeUnit('assassin_test', { class: 'Assassin', atk: 0, hp: 100 }),
      ],
      enemy: [makeUnit('big_target', { hp: 50, atk: 0 })],
      seed: 3,
    });
    const ticks = result.log.ofKind('poison_tick');
    expect(ticks.length).toBeGreaterThan(0);
    // At least one tick should have > 0 damage = stacks.
    const nonZero = ticks.filter((t) => t.damage > 0);
    expect(nonZero.length).toBeGreaterThan(0);
    for (const t of nonZero) expect(t.damage).toBe(t.stacks);
  });

  test('poison caps at 5 stacks per unit', () => {
    const result = runBattle({
      player: [
        makeUnit('assassin_test', { class: 'Assassin', atk: 0, hp: 9999 }),
      ],
      enemy: [makeUnit('durable', { hp: 9999, atk: 0 })],
      seed: 9,
    });
    const applies = result.log.ofKind('apply_poison');
    for (const a of applies) expect(a.after).toBeLessThanOrEqual(5);
  });
});
