// Valiant — Kill Piercing (on_kill).
//
// On kill: deal Valiant's current ATK as pierce damage to the next living
// enemy. Scales with Knight Honorbound Stance buffs. Does not chain — if
// the pierce kills the next enemy, no further pierce fires.
//
// Subscribed to on_kill (dispatched from performAttack).

import { EVT } from '../events.js';

export const kill_piercing = {
  id: 'kill_piercing',
  event: EVT.ON_KILL,
  fn(ctx, { attacker, victim }) {
    const unit = attacker;
    if (!unit?.alive || unit.dying) return;
    const target = ctx.position.frontmostAliveEnemy(unit);
    if (!target || !target.alive) return;
    ctx.log.push('kill_piercing_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      trigger: victim.unitId,
      target: target.unitId,
      targetSlot: target.slot,
      damage: unit.atk,
    });
    // applyDamage (not performAttack) — pierce does not trigger further
    // on_kill / Assassin poison / resonance grants.
    ctx.applyDamage(unit, target, unit.atk, { kind: 'kill_pierce' });
  },
};
