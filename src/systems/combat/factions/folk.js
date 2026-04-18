// Folk faction mechanic:
// Whenever a Folk unit dies, a random surviving Folk unit on the same team
// gains +1 ATK permanently. Fizzles if no surviving Folk remain.

export const folkFaction = {
  name: 'Folk',

  // Merchant favor (Fruit Vendor): at battle start, fire one phantom death
  // buff — a random Folk unit gets +1 ATK, as if the team started with one
  // extra Folk ally who immediately fell. Applied once per team via a flag
  // on the team object so the per-unit initialize hook can't double-fire.
  initialize(ctx, unit) {
    if (unit.faction !== 'Folk') return;
    const team = ctx.ownTeamOf(unit);
    if (ctx.favorCount(team, 'faction', 'Folk') <= 0) return;
    if (team._favorFolkApplied) return;
    team._favorFolkApplied = true;
    const folk = team.slots.filter((u) => u.faction === 'Folk' && u.alive);
    const recipient = ctx.rng.pick(folk);
    if (!recipient) return;
    recipient.baseAtk += 1;
    recipient.atk = recipient.baseAtk + (recipient.resonanceStacks || 0);
    ctx.log.push('folk_favor_buff', {
      recipient: recipient.unitId,
      recipientInstanceId: recipient.instanceId,
      recipientSlot: recipient.slot,
      team: recipient.team,
      newAtk: recipient.atk,
    });
  },

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
      sourceInstanceId: unit.instanceId,
      sourceSlot: unit.slot,
      team: unit.team,
      recipient: recipient.unitId,
      recipientInstanceId: recipient.instanceId,
      recipientSlot: recipient.slot,
      newAtk: recipient.atk,
    });
  },
};
