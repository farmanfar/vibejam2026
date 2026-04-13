// Monster faction synergy: Undead Persistence reanimate.
//
// 10% base + 10% per OTHER Monster on the team, cap 50%. Solo Monster = 10%.
// On death, rolls reanimate. On proc AND alive_count < 5 on the owning team
// after compaction, reanimates at the back slot with full HP. Acts starting
// next round.
//
// Slot-order tiebreak: when multiple Monsters die in the same death batch
// and multiple procs succeed, lower-slot Monster claims the slot first;
// later Monsters fail with a `reanimate_failed_slot_full` event.

import { placeAtBackSlot, MAX_SLOTS } from '../position.js';

export const monsterFaction = {
  name: 'Monster',

  onFaint(ctx, unit) {
    if (!unit.dying) return; // Archer-style interrupt already saved someone else
    if (unit.flags._reanimated) return; // Prevent double-reanimate in same battle
    const team = ctx.ownTeamOf(unit);
    // Count OTHER Monsters on the same team currently alive (includes units
    // in the death batch but dying). Spec says +10% per OTHER Monster.
    const otherMonsters = team.slots.filter(
      (u) => u !== unit && u.faction === 'Monster',
    ).length;
    const chance = Math.min(0.5, 0.1 + 0.1 * otherMonsters);
    const proc = ctx.rng.chance(chance);
    ctx.log.push('reanimate_roll', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      otherMonsters,
      chance,
      proc,
    });
    if (!proc) return;

    // Count currently alive on this team AFTER removing units still flagged
    // dying from the current batch. Dying units will be removed at the end
    // of the batch, so they don't occupy slots.
    const projectedAlive = team.slots.filter(
      (u) => u !== unit && u.alive && !u.dying,
    ).length;
    if (projectedAlive >= MAX_SLOTS) {
      ctx.log.push('reanimate_failed_slot_full', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        projectedAlive,
      });
      return;
    }

    // Clear dying flag so the batch compaction won't remove her, and reset HP.
    unit.dying = false;
    unit.hp = unit.maxHp;
    unit.statuses.poison = 0;
    unit.flags._reanimated = true;
    unit.flags.justReanimated = true;
    unit.flags.reanimatedThisBattle = true;

    // Remove from current slot and place at the back. placeAtBackSlot assumes
    // the unit is not in the team already — so first remove.
    const idx = team.slots.indexOf(unit);
    if (idx !== -1) team.slots.splice(idx, 1);
    const ok = placeAtBackSlot(unit, team);
    if (!ok) {
      // Race: another reanimate in the same batch filled the slot. Mark
      // dying again and let the batch clean up.
      unit.dying = true;
      ctx.log.push('reanimate_failed_slot_full_race', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
      });
      return;
    }
    ctx.log.push('reanimate_success', {
      unit: unit.unitId,
      newSlot: unit.slot,
      team: unit.team,
      newHp: unit.hp,
    });
  },
};
