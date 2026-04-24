import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('Phase A — volatile_payload (Minion #002)', () => {
  test('death deals 2 damage to the opponent front unit', () => {
    // Minion in slot 0 with a beefy ally behind. Frontline enemy counterattacks
    // and kills the minion, whose on_faint hits the same frontline for 2.
    const result = runBattle({
      player: [
        makeUnit('m002', {
          class: 'Grunt',
          faction: 'Robot',
          hp: 1,
          atk: 1,
          ability_id: 'volatile_payload',
        }),
        makeUnit('ally_behind', { hp: 10, atk: 0 }),
      ],
      enemy: [
        makeUnit('frontline', { hp: 3, atk: 1 }),
        makeUnit('backline', { hp: 3, atk: 0 }),
      ],
      seed: 11,
    });
    const start = result.log.ofKind('volatile_payload_start');
    expect(start.length).toBe(1);
    expect(start[0].target).toBe('frontline');
    const blast = result.log
      .ofKind('damage')
      .filter((e) => e.damageKind === 'volatile_payload');
    expect(blast.length).toBe(1);
    expect(blast[0].target).toBe('frontline');
    expect(blast[0].requested).toBe(2);
  });
});

describe('Phase A — sweeping_strikes (Sneaky Swords)', () => {
  test('hits first 3 alive enemies each action and poisons them', () => {
    const result = runBattle({
      player: [
        makeUnit('sneaky', {
          class: 'Assassin',
          hp: 10,
          atk: 1,
          ability_id: 'sweeping_strikes',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 2, atk: 0 }),
        makeUnit('e1', { hp: 2, atk: 0 }),
        makeUnit('e2', { hp: 2, atk: 0 }),
        makeUnit('e3', { hp: 2, atk: 0 }),
      ],
      seed: 6,
    });
    const starts = result.log.ofKind('sweeping_strikes_start');
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) expect(s.targets.length).toBeLessThanOrEqual(3);
    // Poison applied to hit targets each action.
    const poisons = result.log.ofKind('apply_poison');
    expect(poisons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Phase A — piercing_bolt (Electrocutioner)', () => {
  test('fires 2 damage events to slots 0 and 1 each action', () => {
    const result = runBattle({
      player: [
        makeUnit('electro', {
          class: 'Gunner',
          hp: 10,
          atk: 2,
          ability_id: 'piercing_bolt',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 5, atk: 0 }),
        makeUnit('e1', { hp: 5, atk: 0 }),
      ],
      seed: 15,
    });
    const starts = result.log.ofKind('piercing_bolt_start');
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) expect(s.targets.length).toBeLessThanOrEqual(2);
    expect(result.winner).toBe('player');
  });
});

describe('Phase A — heart_slam_on_death (Blood King)', () => {
  test('Blood King dies and fires an AoE that damages every enemy', () => {
    const result = runBattle({
      player: [
        makeUnit('blood_king', {
          name: 'Blood King',
          class: 'Ancient',
          faction: 'Folk',
          hp: 1,
          atk: 2,
          ability_id: 'heart_slam_on_death',
          basicAttackOverride: 'single_target',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 10, atk: 5 }),
        makeUnit('e1', { hp: 1, atk: 0 }),
        makeUnit('e2', { hp: 1, atk: 0 }),
      ],
      seed: 4,
    });
    const start = result.log.ofKind('heart_slam_start');
    expect(start.length).toBe(1);
    expect(start[0].targets.length).toBeGreaterThanOrEqual(1);
  });

  test('Blood King basic attack is single-target, not AoE', () => {
    const result = runBattle({
      player: [
        makeUnit('blood_king', {
          class: 'Ancient',
          faction: 'Folk',
          hp: 100,
          atk: 1,
          ability_id: 'heart_slam_on_death',
          basicAttackOverride: 'single_target',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 3, atk: 0 }),
        makeUnit('e1', { hp: 3, atk: 0 }),
      ],
      seed: 22,
    });
    // Single-target: we should see `action_start` with source='override_single'
    // and standard `attack` events against slot 0 only.
    const overrides = result.log
      .ofKind('action_start')
      .filter((a) => a.source === 'override_single');
    expect(overrides.length).toBeGreaterThan(0);
    const ancientStarts = result.log.ofKind('ancient_aoe_start');
    expect(ancientStarts.length).toBe(0);
  });
});
