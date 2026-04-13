// Status effect manager. For now: poison + the global Toxic Cascade rule.
//
// Unit runtime stores poison as `statuses.poison` (integer, 0..5). Poison
// damages the carrier 1 per stack at the end of each round, ticking BEFORE
// round_end event fires.
//
// Toxic Cascade is a global rule that fires on ANY poisoned unit's death:
// chance = 10% per stack, cap 50%. On proc, all stacks transfer to the next
// living enemy in the opposing team's lineup (relative to the dying unit's
// current slot). If multiple cascades fire in one batch, slot-order
// tiebreak: lower-slot cascade resolves first and re-queries "next enemy".

import { sortBySlot } from './position.js';

export const MAX_POISON_STACKS = 5;

export function applyPoison(target, stacks, ctx, source = null) {
  if (!target?.alive) return;
  const before = target.statuses.poison || 0;
  const after = Math.min(MAX_POISON_STACKS, before + stacks);
  target.statuses.poison = after;
  ctx.log.push('apply_poison', {
    source: source ? source.unitId : null,
    sourceSlot: source ? source.slot : null,
    target: target.unitId,
    targetSlot: target.slot,
    targetTeam: target.team,
    before,
    after,
    requested: stacks,
  });
}

// Overrides existing poison entirely (Gnat's Infectious Bite on proc = 5).
export function setPoison(target, stacks, ctx, source = null) {
  if (!target?.alive) return;
  const before = target.statuses.poison || 0;
  const after = Math.min(MAX_POISON_STACKS, Math.max(before, stacks));
  target.statuses.poison = after;
  ctx.log.push('set_poison', {
    source: source ? source.unitId : null,
    sourceSlot: source ? source.slot : null,
    target: target.unitId,
    targetSlot: target.slot,
    targetTeam: target.team,
    before,
    after,
    requested: stacks,
  });
}

// End-of-round poison tick. Iterates both teams in slot order, applies
// `poison` damage to each carrier, and queues kills into the provided
// death batch. Does NOT resolve the batch — caller does that.
export function tickPoison(ctx, batch) {
  for (const teamKey of ['player', 'enemy']) {
    const team = ctx.teams[teamKey];
    for (const unit of [...team.slots]) {
      if (!unit.alive) continue;
      const stacks = unit.statuses.poison || 0;
      if (stacks <= 0) continue;
      const dmg = stacks;
      unit.hp -= dmg;
      ctx.log.push('poison_tick', {
        target: unit.unitId,
        targetSlot: unit.slot,
        targetTeam: unit.team,
        stacks,
        damage: dmg,
        hpAfter: unit.hp,
      });
      if (unit.hp <= 0 && !unit.dying) {
        unit.dying = true;
        batch.push(unit);
      }
    }
  }
}

// Called from the engine's death batch resolver for every dying unit.
// Returns the target that received the cascaded stacks (for chaining) or null.
export function rollToxicCascade(dying, ctx, batch) {
  const stacks = dying.statuses.poison || 0;
  if (stacks <= 0) return null;
  const chance = Math.min(0.5, 0.1 * stacks);
  const proc = ctx.rng.chance(chance);
  ctx.log.push('cascade_roll', {
    source: dying.unitId,
    sourceSlot: dying.slot,
    sourceTeam: dying.team,
    stacks,
    chance,
    proc,
  });
  if (!proc) return null;

  // Find next living enemy: frontmost surviving unit on the opposing team
  // that is NOT already in the death batch with dying=true.
  const enemyTeam = dying.team === 'player' ? ctx.teams.enemy : ctx.teams.player;
  const nextEnemy = enemyTeam.slots.find((u) => u.alive && !u.dying);
  if (!nextEnemy) {
    ctx.log.push('cascade_no_target', {
      source: dying.unitId,
      sourceSlot: dying.slot,
      sourceTeam: dying.team,
    });
    return null;
  }

  const before = nextEnemy.statuses.poison || 0;
  const after = Math.min(MAX_POISON_STACKS, before + stacks);
  nextEnemy.statuses.poison = after;
  ctx.log.push('cascade_bounce', {
    source: dying.unitId,
    sourceSlot: dying.slot,
    sourceTeam: dying.team,
    target: nextEnemy.unitId,
    targetSlot: nextEnemy.slot,
    targetTeam: nextEnemy.team,
    transferredStacks: stacks,
    beforeStacks: before,
    afterStacks: after,
  });
  return nextEnemy;
}
