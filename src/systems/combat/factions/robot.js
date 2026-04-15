// Robot faction mechanic:
// Each Robot gains +1 HP per OTHER Robot on the team. Static at battle start.

export const robotFaction = {
  name: 'Robot',

  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    const otherRobots = team.slots.filter(
      (u) => u !== unit && u.faction === 'Robot',
    ).length;
    if (otherRobots <= 0) return;
    unit.maxHp += otherRobots;
    unit.hp += otherRobots;
    ctx.log.push('robot_hp_init', {
      unit: unit.unitId,
      instanceId: unit.instanceId,
      slot: unit.slot,
      team: unit.team,
      otherRobots,
      newHp: unit.hp,
    });
  },
};
