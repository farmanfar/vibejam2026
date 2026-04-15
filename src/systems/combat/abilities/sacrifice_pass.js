// Starter Warrior — Sacrifice Pass (on_faint).
//
// On death, the ally at slot+1 (the next ally behind the dying warrior, by
// current slot index at death time) gains +1 ATK permanently. Fizzles if
// there is no alive unit in that slot.

import { EVT } from '../events.js';

export const sacrifice_pass = {
  id: 'sacrifice_pass',
  event: EVT.ON_FAINT,
  fn(ctx, { unit }) {
    if (!unit.dying) return;
    const team = ctx.ownTeamOf(unit);
    const nextSlotUnit = team.slots.find(
      (u) => u !== unit && u.slot === unit.slot + 1 && u.alive && !u.dying,
    );
    if (!nextSlotUnit) {
      ctx.log.push('sacrifice_pass_fizzle', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        reason: 'no_ally_at_slot_plus_one',
      });
      return;
    }
    nextSlotUnit.baseAtk += 1;
    nextSlotUnit.atk = nextSlotUnit.baseAtk + (nextSlotUnit.resonanceStacks || 0);
    ctx.log.push('sacrifice_pass_proc', {
      unit: unit.unitId,
      sourceInstanceId: unit.instanceId,
      slot: unit.slot,
      team: unit.team,
      recipient: nextSlotUnit.unitId,
      recipientInstanceId: nextSlotUnit.instanceId,
      recipientSlot: nextSlotUnit.slot,
      newAtk: nextSlotUnit.atk,
    });
  },
};
