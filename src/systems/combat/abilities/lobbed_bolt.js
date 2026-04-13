// Minion #003 — Lobbed Bolt (on_action).
//
// Each action: attacks the highest-slot living enemy at range <= 3.
// Uses the actor's current ATK. If no enemy is within range <= 3, fizzles
// (in practice, with max 5 slots, this only fizzles if enemy team is
// entirely empty, which means battle is over).

import { EVT } from '../events.js';

export const lobbed_bolt = {
  id: 'lobbed_bolt',
  event: EVT.ON_ACTION,
  fn(ctx, { unit }) {
    const enemies = ctx.position.enemiesWithinRange(unit, 3);
    if (enemies.length === 0) return;
    // Highest slot in range = last element (enemiesWithinRange returns
    // front-to-back order, so [0] is closest, [last] is furthest).
    const target = enemies[enemies.length - 1];
    ctx.log.push('lobbed_bolt_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      target: target.unitId,
      targetSlot: target.slot,
    });
    ctx.performAttack(unit, target, unit.atk, { kind: 'basic' });
  },
};
