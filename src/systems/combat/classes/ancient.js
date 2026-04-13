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

  // No initialize — atk starts at baseAtk, resonance stacks start at 0.
  // _grantAncientResonance recomputes atk when stacks change.

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
