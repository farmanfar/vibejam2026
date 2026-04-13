// Slot queries + compaction helpers for CombatCore.
//
// Teams have a fixed capacity of 5 slots (MAX_SLOTS). Slot 0 = frontmost.
// After any death, surviving units shift forward so the array always holds
// only living units. This means team.slots[0] is ALWAYS the frontmost alive
// unit (after compaction).

export const MAX_SLOTS = 5;

export function compactTeam(team) {
  const before = team.slots.length;
  team.slots = team.slots.filter((u) => u && u.alive);
  // Re-stamp each unit's current slot index so handlers can read it cheaply.
  team.slots.forEach((u, i) => {
    u.slot = i;
  });
  return before !== team.slots.length;
}

export function compactBothTeams(teams) {
  const a = compactTeam(teams.player);
  const b = compactTeam(teams.enemy);
  return a || b;
}

export function aliveCount(team) {
  return team.slots.filter((u) => u.alive).length;
}

// Returns the frontmost living, non-dying enemy. "dying" units are still in
// the slots array during death batch processing — treating them as valid
// targets would direct attacks/pierces at units that are about to be removed.
export function frontmostAliveEnemy(attacker, ctx) {
  const enemyTeam = ctx.enemyTeamOf(attacker);
  return enemyTeam.slots.find((u) => u.alive && !u.dying) ?? null;
}

// Returns up to `range` alive enemies starting from slot 0.
export function enemiesWithinRange(attacker, range, ctx) {
  const enemyTeam = ctx.enemyTeamOf(attacker);
  return enemyTeam.slots.slice(0, range).filter((u) => u.alive);
}

// Returns the enemy at the highest (furthest-back) slot index currently alive.
export function highestSlotAliveEnemy(attacker, ctx) {
  const enemyTeam = ctx.enemyTeamOf(attacker);
  for (let i = enemyTeam.slots.length - 1; i >= 0; i--) {
    if (enemyTeam.slots[i]?.alive) return enemyTeam.slots[i];
  }
  return null;
}

// Used by Minion #002's backward blast: allies at slot-distance <= range
// behind the source unit's current slot index.
export function alliesBehindWithinRange(source, range, ctx) {
  const ownTeam = ctx.ownTeamOf(source);
  const out = [];
  const srcSlot = source.slot;
  for (let i = srcSlot + 1; i < ownTeam.slots.length; i++) {
    if (i - srcSlot > range) break;
    const ally = ownTeam.slots[i];
    if (ally && ally.alive && ally !== source) out.push(ally);
  }
  return out;
}

// Used by Minion #002's forward blast: enemies at slot-distance <= range
// from slot 0 forward. Same as enemiesWithinRange, aliased for clarity.
export function enemiesWithinForwardRange(source, range, ctx) {
  return enemiesWithinRange(source, range, ctx);
}

// Move a unit to the back slot of its own team (used by Archer Death-Defy).
// The unit is removed from its current slot and appended. Slot indices are
// re-stamped.
export function moveUnitToBack(unit, ctx) {
  const team = ctx.ownTeamOf(unit);
  const idx = team.slots.indexOf(unit);
  if (idx === -1) {
    throw new Error(`[position] unit ${unit.unitId} not found in its own team`);
  }
  team.slots.splice(idx, 1);
  team.slots.push(unit);
  team.slots.forEach((u, i) => {
    u.slot = i;
  });
}

// Insert a reanimated unit at the back slot. Used by Monster faction
// synergy. Fails (returns false) if team is full.
export function placeAtBackSlot(unit, team) {
  if (team.slots.length >= MAX_SLOTS) return false;
  team.slots.push(unit);
  team.slots.forEach((u, i) => {
    u.slot = i;
  });
  return true;
}

// Slot-order sort helper for death batch processing. Lower slot index first.
// Ties broken by unit insertion order (stable sort).
export function sortBySlot(units) {
  return [...units].sort((a, b) => a.slot - b.slot);
}
