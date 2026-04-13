// Berserker class mechanic:
// If team has >= 3 Berserkers: all Berserkers get +3 ATK.
// Static at battle start.

export const berserkerClass = {
  name: 'Berserker',

  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    const berserkerCount = team.slots.filter((u) => u.class === 'Berserker').length;
    if (berserkerCount < 3) return;
    unit.baseAtk += 3;
    unit.atk = unit.baseAtk + (unit.resonanceStacks || 0);
    ctx.log.push('berserker_synergy_init', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      berserkerCount,
      newAtk: unit.atk,
    });
  },
};
