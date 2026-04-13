// Blood King — Heart Slam on Death (on_faint).
//
// Fires from death trigger. Deals 1 + resonanceStacks damage to every living
// enemy. Grants Ancient Resonance to other Ancients once (per-action flag
// handled via ctx.grantResonanceForAction). Blood King stays dead — his
// `dying` flag is not cleared, unlike Archer's Death-Defy.

import { EVT } from '../events.js';

export const heart_slam_on_death = {
  id: 'heart_slam_on_death',
  event: EVT.ON_FAINT,
  fn(ctx, { unit }) {
    if (!unit.dying) return;
    const damage = 1 + (unit.resonanceStacks || 0);
    const enemyTeam = ctx.enemyTeamOf(unit);
    const targets = enemyTeam.slots.filter((u) => u.alive);
    ctx.log.push('heart_slam_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      damage,
      resonanceStacks: unit.resonanceStacks || 0,
      targets: targets.map((t) => t.unitId),
    });
    // Grant resonance to other Ancients once for this Heart Slam "action".
    // Clear the per-action flag first in case a lingering state is stuck,
    // then grant.
    unit.flags._resonanceGrantedThisAction = false;
    ctx.grantResonanceForAction(unit);
    for (const target of targets) {
      if (!target.alive || target.dying) continue;
      ctx.applyDamage(unit, target, damage, { kind: 'heart_slam' });
    }
  },
};
