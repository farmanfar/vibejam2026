// Ancient class mechanic: AoE basic attack + Ancient Resonance stack sharing.
//
// onAction: hits every living enemy for current atk damage. `atk` already
// includes the actor's resonance stacks because _grantAncientResonance
// updates atk whenever it gives a stack.
//
// Resonance stacking is granted inside performAttack(kind:'basic') — the
// first performAttack call per action sets the per-action flag and grants
// +1 to all OTHER living Ancients on the actor's team (cap 5).

export const ancientClass = {
  name: 'Ancient',

  // Merchant favor (Fortune Teller): team-level Ancient favor grants every
  // Ancient +1 starting resonance stack — the "phantom trigger" interpretation
  // of "one less needed for the set bonus." No-op on teams without the favor,
  // so normal runs are unchanged.
  initialize(ctx, unit) {
    const team = ctx.ownTeamOf(unit);
    if (ctx.favorCount(team, 'class', 'Ancient') <= 0) return;
    if (unit.resonanceStacks >= 5) return;
    unit.resonanceStacks += 1;
    unit.atk = unit.baseAtk + unit.resonanceStacks + (unit.flags._staticBonusAtk || 0);
    ctx.log.push('ancient_favor_init', {
      unit: unit.unitId,
      instanceId: unit.instanceId,
      slot: unit.slot,
      team: unit.team,
      stacks: unit.resonanceStacks,
      newAtk: unit.atk,
    });
  },

  onAction(ctx, unit) {
    const enemyTeam = ctx.enemyTeamOf(unit);
    const targets = enemyTeam.slots.filter((u) => u.alive);
    if (targets.length === 0) return;
    ctx.log.push('ancient_aoe_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      damage: unit.atk,
      targets: targets.map((t) => t.unitId),
    });
    // Fire performAttack for each target. Only the first call grants
    // resonance (via the per-action flag). Assassin poison does NOT apply
    // because Ancients aren't Assassins (but guard anyway — kind: 'ancient_aoe'
    // would skip poison since it only fires on kind: 'basic').
    for (const target of targets) {
      if (!target.alive || target.dying) continue;
      ctx.performAttack(unit, target, unit.atk, { kind: 'ancient_aoe' });
    }
  },
};
