// Gunner class mechanic:
// If team has >= 3 Gunners: at battle start, each Gunner fires once at the
// highest-slot living enemy for their ATK value. One-shot startup volley.

export const gunnerClass = {
  name: 'Gunner',

  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    const gunnerCount = team.slots.filter((u) => u.class === 'Gunner').length;
    if (gunnerCount < 3) return;
    const target = ctx.position.highestSlotAliveEnemy(unit);
    if (!target) return;
    ctx.log.push('gunner_startup_shot', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      target: target.unitId,
      targetSlot: target.slot,
      gunnerCount,
      damage: unit.atk,
    });
    ctx.applyDamage(unit, target, unit.atk, { kind: 'gunner_startup' });
  },
};
