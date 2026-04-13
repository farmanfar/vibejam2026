// Caged Demon (caged_shocker) — Spiteful Demise (on_faint).
//
// On death, fires 1 damage at a uniform-random living enemy. The random pick
// is seeded through ctx.rng.pick so replays are deterministic.

import { EVT } from '../events.js';

export const spiteful_demise = {
  id: 'spiteful_demise',
  event: EVT.ON_FAINT,
  fn(ctx, { unit }) {
    if (!unit.dying) return;
    const enemyTeam = ctx.enemyTeamOf(unit);
    const targets = enemyTeam.slots.filter((u) => u.alive && !u.dying);
    const target = ctx.rng.pick(targets);
    if (!target) return;
    ctx.log.push('spiteful_demise_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      target: target.unitId,
      targetSlot: target.slot,
    });
    ctx.applyDamage(unit, target, 1, { kind: 'spiteful_demise' });
  },
};
