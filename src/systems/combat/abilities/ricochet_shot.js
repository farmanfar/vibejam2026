// Hog Knight — Ricochet Shot (on_any_death).
//
// Whenever ANY enemy unit dies (from any source), fires 1 damage at the
// next living enemy in the opposing lineup. The trigger is on_any_death
// and the handler filters to only fire when `victim` is on the ENEMY team
// relative to Hog Knight.
//
// Note: on_any_death dispatches from the engine's _fireDeathObservers
// method on ALL living units. The handler checks victim.team !== observer.team
// to ensure only enemy deaths trigger Ricochet Shot.

import { EVT } from '../events.js';

export const ricochet_shot = {
  id: 'ricochet_shot',
  event: EVT.ON_ANY_DEATH,
  fn(ctx, { observer, victim }) {
    if (!observer.alive || observer.dying) return;
    if (victim.team === observer.team) return; // Only enemy deaths
    const target = ctx.position.frontmostAliveEnemy(observer);
    if (!target || target === victim) return; // Dead unit isn't targetable
    ctx.log.push('ricochet_shot_fire', {
      unit: observer.unitId,
      slot: observer.slot,
      team: observer.team,
      target: target.unitId,
      targetSlot: target.slot,
      trigger: victim.unitId,
    });
    ctx.applyDamage(observer, target, 1, { kind: 'ricochet_shot' });
  },
};
