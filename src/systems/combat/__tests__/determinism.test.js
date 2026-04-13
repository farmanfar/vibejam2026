import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('determinism', () => {
  test('same seed produces identical log entries', () => {
    const setup = () => ({
      player: [
        makeUnit('p1', { hp: 3, atk: 1 }),
        makeUnit('p2', { hp: 2, atk: 2 }),
      ],
      enemy: [
        makeUnit('e1', { hp: 4, atk: 1 }),
        makeUnit('e2', { hp: 2, atk: 2 }),
      ],
      seed: 42,
    });
    const a = runBattle(setup());
    const b = runBattle(setup());
    expect(a.log.entries).toEqual(b.log.entries);
    expect(a.winner).toBe(b.winner);
    expect(a.rounds).toBe(b.rounds);
  });

  test('different seeds can produce different outcomes', () => {
    const setup = (seed) => ({
      player: [makeUnit('p', { hp: 2, atk: 1, class: 'Tank' })],
      enemy: [makeUnit('e', { hp: 2, atk: 1 })],
      seed,
    });
    const logs = [];
    for (let s = 1; s <= 5; s++) {
      logs.push(runBattle(setup(s)).log.entries.length);
    }
    // At least two seeds should diverge in log length.
    const unique = new Set(logs);
    expect(unique.size).toBeGreaterThan(1);
  });
});
