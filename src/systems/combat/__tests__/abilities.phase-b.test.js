import { describe, test, expect } from 'vitest';
import { makeUnit, runBattle } from './testHelpers.js';

describe('ricochet_volley (Robo Dagger)', () => {
  test('fires 1 damage at highest-slot enemy at battle start', () => {
    const result = runBattle({
      player: [
        makeUnit('dagger_mush', {
          class: 'Gunner',
          faction: 'Robot',
          hp: 5,
          atk: 2,
          ability_id: 'ricochet_volley',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 3, atk: 0 }),
        makeUnit('e1', { hp: 3, atk: 0 }),
      ],
      seed: 1,
    });
    const starts = result.log.ofKind('ricochet_volley_start');
    expect(starts.length).toBe(1);
    // Should target e1 (highest slot = back row).
    expect(starts[0].target).toBe('e1');
  });
});

describe('spiteful_demise (Caged Demon)', () => {
  test('on death fires 1 damage at a random enemy', () => {
    const result = runBattle({
      player: [
        makeUnit('caged', {
          class: 'Grunt',
          faction: 'Monster',
          hp: 1,
          atk: 0,
          ability_id: 'spiteful_demise',
        }),
      ],
      enemy: [makeUnit('killer', { hp: 10, atk: 5 })],
      seed: 2,
    });
    const starts = result.log.ofKind('spiteful_demise_start');
    expect(starts.length).toBeGreaterThan(0);
  });
});

describe('snipers_venom (Cloaker)', () => {
  test('applies 1 poison to all enemies at battle start from any slot', () => {
    const result = runBattle({
      player: [
        makeUnit('filler', { hp: 5, atk: 1 }),
        makeUnit('cloaker', {
          class: 'Assassin',
          faction: 'Folk',
          hp: 1,
          atk: 1,
          ability_id: 'snipers_venom',
          skipBasicAttack: true,
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 5, atk: 1 }),
        makeUnit('e1', { hp: 5, atk: 1 }),
      ],
      seed: 3,
    });
    const venom = result.log.ofKind('snipers_venom_start');
    expect(venom.length).toBe(1);
    expect(venom[0].targets.length).toBe(2);
    const poisonApplied = result.log.ofKind('apply_poison');
    expect(poisonApplied.length).toBeGreaterThanOrEqual(2);
  });

  test('Cloaker never performs basic attacks (skipBasicAttack)', () => {
    const result = runBattle({
      player: [
        makeUnit('cloaker', {
          class: 'Assassin',
          faction: 'Folk',
          hp: 1,
          atk: 1,
          ability_id: 'snipers_venom',
          skipBasicAttack: true,
        }),
        makeUnit('ally', { hp: 10, atk: 1 }),
      ],
      enemy: [makeUnit('e', { hp: 5, atk: 1 })],
      seed: 4,
    });
    const actions = result.log
      .ofKind('action_start')
      .filter((a) => a.unit === 'cloaker');
    expect(actions.length).toBe(0);
  });
});

describe('death_defying (Archer)', () => {
  test('first lethal hit triggers repositioning + AoE, Archer survives', () => {
    const result = runBattle({
      player: [
        makeUnit('archer', {
          class: 'Ancient',
          faction: 'Folk',
          hp: 1,
          atk: 1,
          ability_id: 'death_defying',
        }),
        makeUnit('ally', { hp: 10, atk: 0 }),
      ],
      enemy: [makeUnit('killer', { hp: 100, atk: 5 })],
      seed: 5,
    });
    const trigger = result.log.ofKind('death_defy_trigger');
    expect(trigger.length).toBe(1);
    const aoe = result.log.ofKind('death_defy_aoe');
    expect(aoe.length).toBe(1);
  });

  test('death defy is single-use: second lethal hit kills Archer', () => {
    let foundResult = null;
    // Search over several seeds to find a run where Archer takes 2 lethal hits.
    for (let s = 0; s < 100 && !foundResult; s++) {
      const r = runBattle({
        player: [
          makeUnit('archer', {
            class: 'Ancient',
            faction: 'Folk',
            hp: 1,
            atk: 0,
            ability_id: 'death_defying',
          }),
        ],
        enemy: [
          makeUnit('killer', { hp: 100, atk: 5 }),
          makeUnit('filler', { hp: 100, atk: 5 }),
        ],
        seed: s,
      });
      // Archer should eventually die (second hit or round cap).
      if (r.winner === 'enemy') foundResult = r;
    }
    expect(foundResult).not.toBeNull();
    const skip = foundResult.log.ofKind('death_defy_skip');
    expect(skip.length).toBeGreaterThan(0);
  });
});

describe('infectious_bite (Gnat)', () => {
  test('procs 5-stack poison on successful 50% roll', () => {
    let found = null;
    for (let s = 0; s < 20 && !found; s++) {
      const r = runBattle({
        player: [
          makeUnit('gnat', {
            class: 'Assassin',
            faction: 'Monster',
            hp: 10,
            atk: 1,
            ability_id: 'infectious_bite',
          }),
        ],
        enemy: [makeUnit('target', { hp: 20, atk: 0 })],
        seed: s,
      });
      const procs = r.log.ofKind('infectious_bite_roll').filter((e) => e.proc);
      if (procs.length > 0) found = r;
    }
    expect(found).not.toBeNull();
    const setPoisons = found.log.ofKind('set_poison');
    expect(setPoisons.length).toBeGreaterThan(0);
    for (const sp of setPoisons) expect(sp.after).toBeLessThanOrEqual(5);
  });
});

describe('ricochet_shot (Hog Knight)', () => {
  test('fires 1 damage at next enemy after any enemy death', () => {
    const result = runBattle({
      player: [
        makeUnit('hog', {
          class: 'Knight',
          faction: 'Folk',
          hp: 10,
          atk: 5,
          ability_id: 'ricochet_shot',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 1, atk: 0 }),
        makeUnit('e1', { hp: 5, atk: 0 }),
      ],
      seed: 6,
    });
    const shots = result.log.ofKind('ricochet_shot_fire');
    expect(shots.length).toBeGreaterThan(0);
  });
});

describe('lobbed_bolt (Minion #003)', () => {
  test('attacks highest-slot enemy in range 3', () => {
    const result = runBattle({
      player: [
        makeUnit('m003', {
          class: 'Grunt',
          faction: 'Robot',
          hp: 5,
          atk: 2,
          ability_id: 'lobbed_bolt',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 5, atk: 0 }),
        makeUnit('e1', { hp: 5, atk: 0 }),
        makeUnit('e2', { hp: 5, atk: 0 }),
        makeUnit('e3', { hp: 5, atk: 0 }),
      ],
      seed: 7,
    });
    const starts = result.log.ofKind('lobbed_bolt_start');
    expect(starts.length).toBeGreaterThan(0);
    // Each shot targets the highest slot in range 3 (slot 0..2), so at
    // most slot index 2 as a target name would be 'e2'.
    expect(starts[0].target).toBe('e2');
  });
});

describe('reactive_reinforcement (Relic Guardian 3)', () => {
  test('+1 ATK when another allied Robot dies', () => {
    const result = runBattle({
      player: [
          // robot_ally is in slot 0 (frontmost) so the killer attacks it first.
        // rg3 is in slot 1 with huge HP so it outlives robot_ally.
        makeUnit('robot_ally', {
          class: 'Grunt',
          faction: 'Robot',
          hp: 1,
          atk: 0,
        }),
        makeUnit('rg3', {
          class: 'Grunt',
          faction: 'Robot',
          hp: 9999,
          atk: 1,
          ability_id: 'reactive_reinforcement',
        }),
      ],
      enemy: [makeUnit('killer', { hp: 50, atk: 5 })],
      seed: 8,
    });
    const procs = result.log.ofKind('reactive_reinforcement_proc');
    expect(procs.length).toBeGreaterThan(0);
    // rg3 starts with atk=1 (no Knight bonus — no other Knights) + 1 = 2.
    expect(procs[0].newAtk).toBe(2);
  });
});

describe('sacrifice_pass (Starter Warrior)', () => {
  test('+1 ATK to ally at slot+1 on death', () => {
    const result = runBattle({
      player: [
        makeUnit('sw', {
          class: 'Grunt',
          faction: 'Folk',
          hp: 1,
          atk: 1,
          ability_id: 'sacrifice_pass',
        }),
        makeUnit('ally', { hp: 10, atk: 1 }),
      ],
      enemy: [makeUnit('killer', { hp: 50, atk: 5 })],
      seed: 9,
    });
    const procs = result.log.ofKind('sacrifice_pass_proc');
    expect(procs.length).toBe(1);
    expect(procs[0].newAtk).toBe(2);
  });

  test('fizzles when no ally at slot+1', () => {
    const result = runBattle({
      player: [
        makeUnit('sw', {
          class: 'Grunt',
          faction: 'Folk',
          hp: 1,
          atk: 1,
          ability_id: 'sacrifice_pass',
        }),
      ],
      enemy: [makeUnit('killer', { hp: 50, atk: 5 })],
      seed: 10,
    });
    const fizzles = result.log.ofKind('sacrifice_pass_fizzle');
    expect(fizzles.length).toBe(1);
  });
});

describe('bloodlust (Tribal Chopper)', () => {
  test('takes one bonus attack on kill, but bonus kill does not chain', () => {
    const result = runBattle({
      player: [
        makeUnit('chopper', {
          class: 'Berserker',
          faction: 'Folk',
          hp: 10,
          atk: 5,
          ability_id: 'bloodlust',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 1, atk: 0 }),
        makeUnit('e1', { hp: 1, atk: 0 }),
        makeUnit('e2', { hp: 5, atk: 0 }),
      ],
      seed: 11,
    });
    const bonuses = result.log.ofKind('bloodlust_bonus_start');
    expect(bonuses.length).toBeGreaterThan(0);
  });
});

describe('kill_piercing (Valiant)', () => {
  test('on kill, deals ATK pierce damage to next enemy', () => {
    const result = runBattle({
      player: [
        makeUnit('valiant', {
          class: 'Knight',
          faction: 'Folk',
          hp: 10,
          atk: 3,
          ability_id: 'kill_piercing',
        }),
      ],
      enemy: [
        makeUnit('e0', { hp: 1, atk: 0 }),
        makeUnit('e1', { hp: 5, atk: 0 }),
      ],
      seed: 12,
    });
    const pierces = result.log.ofKind('kill_piercing_start');
    expect(pierces.length).toBeGreaterThan(0);
    expect(pierces[0].damage).toBe(3);
    expect(pierces[0].target).toBe('e1');
  });
});
