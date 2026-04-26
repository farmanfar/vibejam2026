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
    ).length + ctx.favorCount(team, 'class', 'Knight');
    if (otherKnights <= 0) return;
    // Halved payoff: team-total scaling stays linear in N but the per-unit
    // coefficient is ceil(N/2), so a 5-Knight team goes from +4/+4 per Knight
    // (+20/+20 team-wide) down to +2/+2 per Knight (+10/+10 team-wide).
    const bonus = Math.ceil(otherKnights / 2);
    unit.flags._staticBonusAtk = (unit.flags._staticBonusAtk || 0) + bonus;
    unit.baseAtk += bonus;
    unit.atk = unit.baseAtk + (unit.resonanceStacks || 0);
    unit.maxHp += bonus;
    unit.hp += bonus;
    ctx.log.push('knight_honorbound_init', {
      unit: unit.unitId,
      instanceId: unit.instanceId,
      slot: unit.slot,
      team: unit.team,
      otherKnights,
      bonus,
      newAtk: unit.atk,
      newHp: unit.hp,
    });
  },
};
