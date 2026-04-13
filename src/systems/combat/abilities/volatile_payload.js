// Minion #002 — Volatile Payload (on_faint).
//
// On death, explodes in both directions. 2 damage forward to enemies in the
// first 2 slots; 2 damage backward to allies within slot-distance 2 behind
// her own slot at the moment of death. Friendly fire intentional. New deaths
// caused by the blast are appended to the SAME death batch queue by the
// engine's natural "check for newly lethal units" sweep.

import { EVT } from '../events.js';

export const volatile_payload = {
  id: 'volatile_payload',
  event: EVT.ON_FAINT,
  fn(ctx, { unit }) {
    if (!unit.dying) return; // Someone else's interrupt saved him? He's fine.
    const forward = ctx.position.enemiesWithinForwardRange(unit, 2);
    const backward = ctx.position.alliesBehindWithinRange(unit, 2);
    ctx.log.push('volatile_payload_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      forwardTargets: forward.map((t) => t.unitId),
      backwardTargets: backward.map((t) => t.unitId),
    });
    for (const target of forward) {
      ctx.applyDamage(unit, target, 2, { kind: 'volatile_payload_forward' });
    }
    for (const target of backward) {
      ctx.applyDamage(unit, target, 2, { kind: 'volatile_payload_backward' });
    }
  },
};
