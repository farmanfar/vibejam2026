// Electrocutioner — Piercing Bolt (on_action).
//
// Each action: 2 separate damage events, one to slot 0 and one to slot 1 of
// the enemy team (after compaction). Each damage event is atk damage (not
// a hardcoded 2). If slot 1 is empty (enemy team has only one living unit),
// the second damage event is skipped.
//
// Electrocutioner is Gunner class, not Assassin, so no poison application.
// Each damage event is an independent attack — if slot 0 dies from the
// first bolt, the second bolt targets what was slot 1 (after compaction,
// now slot 0). We snapshot targets BEFORE damage resolution to preserve
// the spec intent of "slot 0 and slot 1 at time of action".

import { EVT } from '../events.js';

export const piercing_bolt = {
  id: 'piercing_bolt',
  event: EVT.ON_ACTION,
  fn(ctx, { unit }) {
    const targets = ctx.position.enemiesWithinRange(unit, 2);
    if (targets.length === 0) return;
    ctx.log.push('piercing_bolt_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      targets: targets.map((t) => t.unitId),
    });
    // Snapshot targets first so death of slot 0 doesn't affect slot 1's
    // intended victim. We still null-check `alive` inside performAttack.
    const snapshot = [...targets];
    for (const target of snapshot) {
      if (!target.alive || target.dying) continue;
      ctx.performAttack(unit, target, unit.atk, { kind: 'piercing_bolt' });
    }
  },
};
