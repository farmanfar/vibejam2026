import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('Ancient class', () => {
  test('Ancient basic action hits all living enemies', () => {
    const result = runBattle({
      player: [
        makeUnit('ancient_a', {
          class: 'Ancient',
          faction: 'Robot',
          hp: 10,
          atk: 1,
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 1, atk: 0 }),
        makeUnit('e1', { hp: 1, atk: 0 }),
        makeUnit('e2', { hp: 1, atk: 0 }),
      ],
      seed: 5,
    });
    const aoe = result.log.ofKind('ancient_aoe_start');
    expect(aoe.length).toBeGreaterThan(0);
    // First aoe_start should list all 3 enemies.
    expect(aoe[0].targets.length).toBe(3);
  });

  test('Resonance stacks grant to OTHER Ancients on same team (not self)', () => {
    const result = runBattle({
      player: [
        makeUnit('ancient_a', {
          class: 'Ancient',
          faction: 'Robot',
          hp: 50,
          atk: 1,
        }),
        makeUnit('ancient_b', {
          class: 'Ancient',
          faction: 'Robot',
          hp: 50,
          atk: 1,
        }),
      ],
      enemy: [
        makeUnit('filler', { hp: 50, atk: 0 }),
        makeUnit('filler2', { hp: 50, atk: 0 }),
      ],
      seed: 8,
    });
    const stacks = result.log.ofKind('resonance_stack');
    expect(stacks.length).toBeGreaterThan(0);
    // Source is never equal to target — core invariant.
    for (const s of stacks) expect(s.source).not.toBe(s.target);
    // Under SAP front-only ticks, only the frontmost Ancient (ancient_a in
    // slot 0) acts per tick, so ancient_b is the only stack recipient.
    // ancient_a never receives because it's always the actor and fillers
    // with 0 atk can't kill it to promote ancient_b to front.
    const recipients = new Set(stacks.map((s) => s.target));
    expect(recipients.has('ancient_b')).toBe(true);
    expect(recipients.has('ancient_a')).toBe(false);
  });

  test('Resonance caps at 3 stacks per Ancient', () => {
    const result = runBattle({
      player: [
        makeUnit('a1', { class: 'Ancient', faction: 'Robot', hp: 9999, atk: 0 }),
        makeUnit('a2', { class: 'Ancient', faction: 'Robot', hp: 9999, atk: 0 }),
      ],
      enemy: [makeUnit('wall', { hp: 9999, atk: 0 })],
      seed: 13,
    });
    const stacks = result.log.ofKind('resonance_stack');
    for (const s of stacks) expect(s.stacks).toBeLessThanOrEqual(3);
  });
});

describe('Knight class', () => {
  test('Honorbound Stance applies ceil(otherKnights/2) ATK/HP, static at battle start', () => {
    const result = runBattle({
      player: [
        makeUnit('k1', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k2', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k3', { class: 'Knight', hp: 3, atk: 2 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 3,
    });
    const inits = result.log.ofKind('knight_honorbound_init');
    expect(inits.length).toBe(3);
    for (const init of inits) {
      // 3-Knight team: each sees 2 other Knights -> ceil(2/2)=1 bonus.
      expect(init.otherKnights).toBe(2);
      expect(init.bonus).toBe(1);
      expect(init.newAtk).toBe(3);
      expect(init.newHp).toBe(4);
    }
  });

  test('Honorbound scales slower than N: 5 Knights -> +2/+2 each (not +4/+4)', () => {
    const result = runBattle({
      player: [
        makeUnit('k1', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k2', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k3', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k4', { class: 'Knight', hp: 3, atk: 2 }),
        makeUnit('k5', { class: 'Knight', hp: 3, atk: 2 }),
      ],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 4,
    });
    const inits = result.log.ofKind('knight_honorbound_init');
    expect(inits.length).toBe(5);
    for (const init of inits) {
      expect(init.otherKnights).toBe(4);
      expect(init.bonus).toBe(2);
      expect(init.newAtk).toBe(4);
      expect(init.newHp).toBe(5);
    }
  });

  test('Solo Knight gets no Honorbound bonus', () => {
    const result = runBattle({
      player: [makeUnit('lone', { class: 'Knight', hp: 3, atk: 2 })],
      enemy: [makeUnit('dummy', { hp: 999, atk: 0 })],
      seed: 1,
    });
    const inits = result.log.ofKind('knight_honorbound_init');
    expect(inits.length).toBe(0);
  });
});

describe('Tank class', () => {
  test('Tank Reactive Armor rolls on every incoming hit', () => {
    const result = runBattle({
      player: [
        makeUnit('tank_a', { class: 'Tank', faction: 'Robot', hp: 20, atk: 1 }),
      ],
      enemy: [makeUnit('attacker', { hp: 20, atk: 1 })],
      seed: 14,
    });
    const rolls = result.log.ofKind('reactive_armor_roll');
    expect(rolls.length).toBeGreaterThan(0);
    // Solo Tank -> chance should be 0.1
    for (const r of rolls) expect(r.chance).toBeCloseTo(0.1);
  });

  test('Reactive Armor scales with Tank count (2 Tanks -> 20% chance)', () => {
    const result = runBattle({
      player: [
        makeUnit('t1', { class: 'Tank', hp: 20, atk: 1 }),
        makeUnit('t2', { class: 'Tank', hp: 20, atk: 1 }),
      ],
      enemy: [makeUnit('attacker', { hp: 20, atk: 1 })],
      seed: 17,
    });
    const rolls = result.log.ofKind('reactive_armor_roll');
    for (const r of rolls) expect(r.chance).toBeCloseTo(0.2);
  });

  test('Reactive Armor caps at 50% with 5 Tanks', () => {
    const result = runBattle({
      player: [
        makeUnit('t1', { class: 'Tank', hp: 20, atk: 0 }),
        makeUnit('t2', { class: 'Tank', hp: 20, atk: 0 }),
        makeUnit('t3', { class: 'Tank', hp: 20, atk: 0 }),
        makeUnit('t4', { class: 'Tank', hp: 20, atk: 0 }),
        makeUnit('t5', { class: 'Tank', hp: 20, atk: 0 }),
      ],
      enemy: [makeUnit('attacker', { hp: 100, atk: 1 })],
      seed: 19,
    });
    // At least some rolls should show 5 tanks alive (early rounds).
    const rolls = result.log.ofKind('reactive_armor_roll');
    expect(rolls.length).toBeGreaterThan(0);
    for (const r of rolls) expect(r.chance).toBeLessThanOrEqual(0.5);
    const fullCapRolls = rolls.filter((r) => r.chance === 0.5);
    expect(fullCapRolls.length).toBeGreaterThan(0);
  });
});
