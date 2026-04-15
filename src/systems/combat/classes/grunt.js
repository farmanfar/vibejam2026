// Grunt class mechanic:
// If team has >= 3 Grunts: all Grunts get +3 HP.
// If team has >= 5 Grunts: all Grunts also get +3 ATK.
// Static at battle start.

export const gruntClass = {
  name: 'Grunt',

  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    const gruntCount = team.slots.filter((u) => u.class === 'Grunt').length;
    let bonusHp = 0;
    let bonusAtk = 0;
    if (gruntCount >= 5) { bonusHp = 3; bonusAtk = 3; }
    else if (gruntCount >= 3) { bonusHp = 3; }
    if (bonusHp === 0 && bonusAtk === 0) return;
    unit.maxHp += bonusHp;
    unit.hp += bonusHp;
    unit.baseAtk += bonusAtk;
    unit.atk = unit.baseAtk + (unit.resonanceStacks || 0);
    ctx.log.push('grunt_synergy_init', {
      unit: unit.unitId,
      instanceId: unit.instanceId,
      slot: unit.slot,
      team: unit.team,
      gruntCount,
      bonusHp,
      bonusAtk,
      newHp: unit.hp,
      newAtk: unit.atk,
    });
  },
};
