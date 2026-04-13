// Archer — Death-Defying Repositioning (on_faint, INTERRUPT priority).
//
// Once per battle: when Archer takes lethal damage, her on_faint handler
// intercepts, clears her dying flag, moves her to the back slot, and fires
// 1 damage to ALL living units (both teams) in slots in front of her new
// back position (friendly fire intentional).
//
// New deaths caused by the AoE are appended to the SAME death batch by the
// engine's natural newly-lethal sweep at the end of the batch iteration.
//
// Runs at INTERRUPT priority (0) so it resolves before other on_faint
// handlers that might read her position or assume she's gone.

import { EVT, TRIGGER_PRIORITY } from '../events.js';

export const death_defying = {
  id: 'death_defying',
  event: EVT.ON_FAINT,
  priority: TRIGGER_PRIORITY.INTERRUPT,
  fn(ctx, { unit }) {
    if (!unit.dying) return;
    if (unit.usedDeathDefy) {
      // Second lethal hit — die normally.
      ctx.log.push('death_defy_skip', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        reason: 'already_used',
      });
      return;
    }
    // Interrupt: save her.
    unit.dying = false;
    unit.usedDeathDefy = true;
    // Restore to 1 HP so she's alive after the batch. (HP is already 0 from
    // the killing blow. She was saved — give her the minimum 1 HP.)
    unit.hp = 1;
    ctx.log.push('death_defy_trigger', {
      unit: unit.unitId,
      oldSlot: unit.slot,
      team: unit.team,
    });
    ctx.position.moveUnitToBack(unit);
    ctx.log.push('death_defy_repositioned', {
      unit: unit.unitId,
      newSlot: unit.slot,
      team: unit.team,
    });

    // AoE: every living unit on BOTH teams in slots in front of her new
    // position gets 1 damage. For the enemy team, "in front" = slots that
    // exist (all slots are in front of her). For her own team, slots 0..(slot-1).
    const ownTeam = ctx.ownTeamOf(unit);
    const enemyTeam = ctx.enemyTeamOf(unit);
    const archerNewSlot = unit.slot;
    const alliesInFront = ownTeam.slots.filter(
      (u) => u !== unit && u.alive && !u.dying && u.slot < archerNewSlot,
    );
    const enemiesInFront = enemyTeam.slots.filter((u) => u.alive && !u.dying);
    const allTargets = [...alliesInFront, ...enemiesInFront];
    ctx.log.push('death_defy_aoe', {
      unit: unit.unitId,
      newSlot: unit.slot,
      team: unit.team,
      alliesHit: alliesInFront.map((t) => t.unitId),
      enemiesHit: enemiesInFront.map((t) => t.unitId),
    });
    for (const target of allTargets) {
      ctx.applyDamage(unit, target, 1, { kind: 'death_defy_aoe' });
    }
  },
};
