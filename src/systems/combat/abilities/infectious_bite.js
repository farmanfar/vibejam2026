// Gnat — Infectious Bite (before_attack).
//
// 50% chance per attack: apply 5 poison stacks instead of the Assassin
// class default 1. On proc, sets attacker.flags.infectiousBiteOverride = 5
// so the main engine's Assassin poison code calls setPoison(target, 5)
// instead of applyPoison(target, 1). On miss, flag stays 0 and the class
// default fires normally.

import { EVT } from '../events.js';

export const infectious_bite = {
  id: 'infectious_bite',
  event: EVT.BEFORE_ATTACK,
  fn(ctx, { unit, attacker, target }) {
    // `unit` is the unit whose ability handler fired (i.e. Gnat).
    // Only fire when Gnat herself is the attacker — BEFORE_ATTACK events
    // fire globally and all living units' handlers are checked.
    const actor = unit;
    if (!actor || actor !== attacker) return;
    const proc = ctx.rng.chance(0.5);
    ctx.log.push('infectious_bite_roll', {
      unit: actor.unitId,
      slot: actor.slot,
      team: actor.team,
      target: target?.unitId,
      proc,
    });
    if (proc) {
      actor.flags.infectiousBiteOverride = 5;
    }
  },
};
