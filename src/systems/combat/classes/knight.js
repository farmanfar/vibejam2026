// Knight class mechanic: Honorbound Stance.
//
// Each Knight gains +1 HP and +1 ATK per OTHER Knight on the team. Static at
// battle start, does NOT recalculate mid-battle. The buff is applied via
// `_staticBonusAtk` and adjusted atk/hp/maxHp on the runtime unit.

export const knightClass = {
  name: 'Knight',

  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    const otherKnights = team.slots.filter(
      (u) => u !== unit && u.class === 'Knight',
    ).length;
    if (otherKnights <= 0) return;
    unit.flags._staticBonusAtk = (unit.flags._staticBonusAtk || 0) + otherKnights;
    unit.baseAtk += otherKnights;
    unit.atk = unit.baseAtk + (unit.resonanceStacks || 0);
    unit.maxHp += otherKnights;
    unit.hp += otherKnights;
    ctx.log.push('knight_honorbound_init', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      otherKnights,
      newAtk: unit.atk,
      newHp: unit.hp,
    });
  },
};
