// Pure log aggregator. Reads result.log.entries only — does NOT touch result.teams.
// Produces per-unit telemetry, per-team totals, ability-fire counts, and battle meta.
//
// Call: analyzeResult(coreRunResult) -> AnalysisResult
//
// Update ABILITY_FIRE_WHITELIST when adding new abilities/classes/factions.
// See src/systems/combat/CLAUDE.md §Adding-a-New-Unit.

const ABILITY_FIRE_WHITELIST = new Set([
  // Class initializers (battle-start, per-unit)
  'ancient_favor_init', 'grunt_synergy_init', 'knight_honorbound_init',
  'berserker_synergy_init', 'robot_hp_init',

  // Class active effects
  'ancient_aoe_start', 'gunner_startup_shot',

  // Faction effects
  'folk_favor_buff', 'folk_death_buff', 'folk_death_buff_fizzle',

  // Archer Death-Defy
  'death_defy_trigger', 'death_defy_repositioned', 'death_defy_aoe', 'death_defy_skip',

  // Abilities
  'snipers_venom_start', 'ricochet_volley_start', 'piercing_bolt_start',
  'bloodlust_bonus_start', 'ricochet_shot_fire', 'infectious_bite_roll',
  'heart_slam_start', 'sacrifice_pass_proc', 'reactive_reinforcement_proc',
  'kill_piercing_start', 'lobbed_bolt_start', 'spiteful_demise_start',
  'volatile_payload_start', 'sweeping_strikes_start',
]);

/**
 * @param {object} result  Return value of CombatCore.run().
 * @returns {AnalysisResult}
 */
export function analyzeResult(result) {
  const entries = result.log.entries;
  if (!entries || entries.length === 0) {
    throw new Error('[Telemetry] log.entries is empty — was battle_init logged?');
  }

  // battle_init is always first. It carries the authoritative roster.
  const initEntry = entries[0];
  if (initEntry.kind !== 'battle_init') {
    throw new Error(`[Telemetry] Expected battle_init at index 0, got ${initEntry.kind}`);
  }

  const playerFavor = initEntry.playerFavor ?? null;
  const enemyFavor  = initEntry.enemyFavor  ?? null;

  // Seed perUnit from the battle_init snapshot (not from live result.teams).
  const perUnit = {};
  for (const snap of [...(initEntry.player ?? []), ...(initEntry.enemy ?? [])]) {
    if (snap.instanceId == null) continue;
    perUnit[snap.instanceId] = {
      unitId: snap.unitId,
      team: snap.team,
      startSlot: snap.slot,
      tier: snap.tier ?? null,
      class: snap.class ?? null,
      faction: snap.faction ?? null,
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      deaths: 0,
      survivalRounds: null,
      reanimates: 0,
      resonanceStacksPeak: 0,
    };
  }

  const perTeam = {
    player: { damageDealt: 0, unitsLost: 0, favor: playerFavor },
    enemy:  { damageDealt: 0, unitsLost: 0, favor: enemyFavor  },
  };

  const meta = {
    winner: result.winner,
    rounds: result.rounds,
    seed: initEntry.seed ?? null,
    playerFavor,
    enemyFavor,
    environmentalDeaths: 0,
  };

  const abilityFires = {};

  // targetInstanceId -> { attacker: instanceId|null, round: Number }
  const tentativeKillBy = new Map();
  let currentRound = 0;

  for (const entry of entries.slice(1)) {
    const { kind } = entry;

    if (kind === 'round_start') {
      currentRound = entry.round;
      continue;
    }

    // --- damage accounting ---
    if (kind === 'attack' || kind === 'damage') {
      const { attackerInstanceId, targetInstanceId, damage, blocked, hpAfter } = entry;
      if (attackerInstanceId && !blocked && perUnit[attackerInstanceId]) {
        perUnit[attackerInstanceId].damageDealt += damage;
      }
      if (targetInstanceId && !blocked && perUnit[targetInstanceId]) {
        perUnit[targetInstanceId].damageTaken += damage;
      }
      if (!blocked && hpAfter <= 0 && targetInstanceId) {
        tentativeKillBy.set(targetInstanceId, {
          attacker: attackerInstanceId ?? null,
          round: currentRound,
        });
      }
      continue;
    }

    if (kind === 'poison_tick') {
      const { targetInstanceId, damage, hpAfter } = entry;
      if (targetInstanceId && perUnit[targetInstanceId]) {
        perUnit[targetInstanceId].damageTaken += damage;
      }
      if (hpAfter <= 0 && targetInstanceId) {
        tentativeKillBy.set(targetInstanceId, { attacker: null, round: currentRound });
      }
      continue;
    }

    // --- confirmed death (skipped for Death-Defy saves and Monster reanimates) ---
    if (kind === 'faint_final') {
      const { instanceId } = entry;
      const credit = tentativeKillBy.get(instanceId);
      if (perUnit[instanceId]) {
        perUnit[instanceId].deaths++;
        perUnit[instanceId].survivalRounds = credit?.round ?? currentRound;
      }
      if (credit?.attacker && perUnit[credit.attacker]) {
        perUnit[credit.attacker].kills++;
      } else {
        meta.environmentalDeaths++;
      }
      tentativeKillBy.delete(instanceId);
      continue;
    }

    // --- reanimate: fires INSTEAD OF faint_final — death counter untouched ---
    if (kind === 'reanimate_success') {
      const { instanceId } = entry;
      if (perUnit[instanceId]) {
        perUnit[instanceId].reanimates++;
      }
      tentativeKillBy.delete(instanceId);
      continue;
    }

    // --- resonance peak: credits the TARGET Ancient who received the stack ---
    if (kind === 'resonance_stack') {
      const tgt = perUnit[entry.targetInstanceId];
      if (tgt) {
        tgt.resonanceStacksPeak = Math.max(tgt.resonanceStacksPeak, entry.stacks ?? 0);
      }
      continue;
    }

    // Merchant Ancient favor grants an initial stack at battle start.
    if (kind === 'ancient_favor_init') {
      const tgt = perUnit[entry.instanceId];
      if (tgt) {
        tgt.resonanceStacksPeak = Math.max(tgt.resonanceStacksPeak, entry.stacks ?? 1);
      }
      // Also counts as an ability fire.
    }

    // --- ability fires (whitelist only) ---
    if (ABILITY_FIRE_WHITELIST.has(kind)) {
      const uid = entry.unit;
      if (uid) {
        if (!abilityFires[uid]) abilityFires[uid] = {};
        abilityFires[uid][kind] = (abilityFires[uid][kind] ?? 0) + 1;
      }
    }
  }

  // Post-loop: perTeam aggregates
  for (const inst of Object.values(perUnit)) {
    perTeam[inst.team].damageDealt += inst.damageDealt;
    if (inst.deaths > 0) {
      perTeam[inst.team].unitsLost++;
    }
  }

  return { meta, perTeam, perUnit, abilityFires };
}
