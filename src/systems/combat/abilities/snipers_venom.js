// Cloaker (archer_bandit) — Snipers Venom (on_battle_start).
//
// At battle start, applies 1 poison stack to every living enemy from any slot.
// Cloaker has skipBasicAttack: true (never takes a basic action). The engine
// checks skipBasicAttack before the action dispatch loop.

import { EVT } from '../events.js';
import { applyPoison } from '../status.js';

export const snipers_venom = {
  id: 'snipers_venom',
  event: EVT.BATTLE_START,
  fn(ctx, { unit }) {
    const enemyTeam = ctx.enemyTeamOf(unit);
    const targets = enemyTeam.slots.filter((u) => u.alive);
    ctx.log.push('snipers_venom_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      targets: targets.map((t) => t.unitId),
    });
    for (const target of targets) {
      applyPoison(target, 1, ctx, unit);
    }
  },
};
