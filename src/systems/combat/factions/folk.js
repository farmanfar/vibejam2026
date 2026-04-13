// Folk faction mechanic:
// Whenever a Folk unit dies, a random surviving Folk unit on the same team
// gains +1 ATK permanently. Fizzles if no surviving Folk remain.

export const folkFaction = {
  name: 'Folk',

  onFaint(ctx, unit) {
    if (!unit.dying) return;
    if (unit.faction !== 'Folk') return;
    const team = ctx.ownTeamOf(unit);
    const survivors = team.slots.filter(
      (u) => u !== unit && u.faction === 'Folk' && u.alive && !u.dying,
    );
    const recipient = ctx.rng.pick(survivors);
    if (!recipient) {
      ctx.log.push('folk_death_buff_fizzle', {
        source: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        reason: 'no_folk_survivors',
      });
      return;
    }
    recipient.baseAtk += 1;
    recipient.atk = recipient.baseAtk + (recipient.resonanceStacks || 0);
    ctx.log.push('folk_death_buff', {
      source: unit.unitId,
      sourceSlot: unit.slot,
      team: unit.team,
      recipient: recipient.unitId,
      recipientSlot: recipient.slot,
      newAtk: recipient.atk,
    });
  },
};
