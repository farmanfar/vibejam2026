// Minion #002 — Volatile Payload (on_faint).
//
// On death, deals 2 damage to the opponent's frontmost alive unit. Single
// target — no friendly fire, no multi-slot blast. If the hit is lethal, the
// killed unit is appended to the SAME death batch queue by the engine's
// natural "check for newly lethal units" sweep, so chain-deaths still fire
// their own on_faint handlers in slot order before compaction.

import { EVT } from '../events.js';

export const volatile_payload = {
  id: 'volatile_payload',
  event: EVT.ON_FAINT,
  fn(ctx, { unit }) {
    if (!unit.dying) return; // Someone else's interrupt saved him? He's fine.
    const target = ctx.position.frontmostAliveEnemy(unit);
    ctx.log.push('volatile_payload_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      target: target?.unitId ?? null,
    });
    if (!target) return;
    ctx.applyDamage(unit, target, 2, { kind: 'volatile_payload' });
  },
};
