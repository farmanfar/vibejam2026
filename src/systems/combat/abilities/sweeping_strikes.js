// Sneaky Swords (assassin) — Sweeping Strikes (on_action).
//
// Each action: 1 damage to the first 3 alive enemies. Assassin class poison
// (via performAttack kind:'basic') applies to each target hit.
//
// Note: Sweeping Strikes uses the actor's `atk` as the per-hit damage, not a
// hardcoded 1. The spec says "1 dmg" but base atk for Sneaky Swords is 1 so
// both interpretations currently match. If the balance pass bumps her atk,
// each strike scales with it — consistent with standard scaling.

import { EVT } from '../events.js';

export const sweeping_strikes = {
  id: 'sweeping_strikes',
  event: EVT.ON_ACTION,
  fn(ctx, { unit }) {
    const targets = ctx.position.enemiesWithinRange(unit, 3);
    if (targets.length === 0) return;
    ctx.log.push('sweeping_strikes_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      targets: targets.map((t) => t.unitId),
    });
    for (const target of targets) {
      if (!target.alive || target.dying) continue;
      ctx.performAttack(unit, target, unit.atk, { kind: 'basic' });
    }
  },
};
