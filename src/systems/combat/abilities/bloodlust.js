// Tribal Chopper — Bloodlust (on_kill, from regular basic attack only).
//
// On killing an enemy with a REGULAR attack action, immediately takes one
// bonus attack against the next frontmost enemy. Bonus attacks do NOT chain:
// a kill from the bonus attack does not grant another bonus.
//
// Implementation: we subscribe to on_kill (dispatched from performAttack
// when kind === 'basic'). We use a flag `_bloodlustBonusAttackPending` to
// prevent re-entry. The bonus attack calls performAttack with kind:
// 'bloodlust_bonus' — on_kill won't chain because this handler checks
// `source.flags._inBloodlustBonus`.

import { EVT } from '../events.js';

export const bloodlust = {
  id: 'bloodlust',
  event: EVT.ON_KILL,
  fn(ctx, { attacker, victim }) {
    const unit = attacker;
    if (!unit?.alive || unit.dying) return;
    // Only fire on regular attack kills, not bonus attack kills.
    if (unit.flags._inBloodlustBonus) return;
    const target = ctx.position.frontmostAliveEnemy(unit);
    if (!target || !target.alive) return;
    ctx.log.push('bloodlust_bonus_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      trigger: victim.unitId,
      target: target.unitId,
      targetSlot: target.slot,
    });
    unit.flags._inBloodlustBonus = true;
    ctx.performAttack(unit, target, unit.atk, { kind: 'bloodlust_bonus' });
    unit.flags._inBloodlustBonus = false;
  },
};
