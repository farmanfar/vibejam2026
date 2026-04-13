// Robo Dagger (dagger_mush) — Ricochet Volley (on_battle_start).
//
// At battle start, fires 1 damage at the highest-slot living enemy.
// Uses applyDamage (not a basic attack — no Assassin poison, no resonance).

import { EVT } from '../events.js';

export const ricochet_volley = {
  id: 'ricochet_volley',
  event: EVT.BATTLE_START,
  fn(ctx, { unit }) {
    const target = ctx.position.highestSlotAliveEnemy(unit);
    if (!target) return;
    ctx.log.push('ricochet_volley_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      target: target.unitId,
      targetSlot: target.slot,
    });
    ctx.applyDamage(unit, target, 1, { kind: 'ricochet_volley' });
  },
};
