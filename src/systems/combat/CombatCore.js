// CombatCore — alpha-roster auto-battle engine.
//
// This engine is ISOLATED from the legacy BattleEngine.js path. It is NOT
// used by BattleScene/ShopScene/GhostManager. Only the sim CLI and vitest
// tests instantiate it. See design/CLAUDE.md and plan v4 for the rationale.
//
// Public API:
//   const core = new CombatCore({ registry, seed });
//   const result = core.run({ player: [...defs], enemy: [...defs] });
//   // result = { winner, rounds, log: CombatLog, teams }
//
// Unit definition shape (from the generator):
//   {
//     id, name, faction, class, tier,
//     hp, atk, range,
//     ability_id, skipBasicAttack?
//   }

import { RNG } from './RNG.js';
import { CombatLog } from './CombatLog.js';
import { EVT } from './events.js';
import {
  MAX_SLOTS,
  compactBothTeams,
  compactTeam,
  frontmostAliveEnemy,
  enemiesWithinRange,
  highestSlotAliveEnemy,
  alliesBehindWithinRange,
  enemiesWithinForwardRange,
  moveUnitToBack,
  placeAtBackSlot,
  sortBySlot,
  aliveCount,
} from './position.js';
import {
  applyPoison,
  setPoison,
  tickPoison,
  rollToxicCascade,
} from './status.js';

const MAX_ROUNDS = 200;
const DEATH_BATCH_WARN = 100;

export class CombatCore {
  constructor({ registry, seed = 0 } = {}) {
    if (!registry) throw new Error('[CombatCore] registry required');
    this.registry = registry;
    this.rng = new RNG(seed);
    this.log = new CombatLog();
    this.teams = null;
    this.round = 0;
    // Tick context is active during _runTick. When non-null, performAttack
    // queues ON_KILL events into pendingKillEvents instead of firing them
    // inline, and does NOT call _resolveDeathBatch mid-swing. This gives the
    // SAP "both fronts swing simultaneously, then resolve deaths" invariant.
    this._tickContext = null;
    // Ctx helpers bound to this engine — handlers receive `this` as ctx.
    this.position = {
      frontmostAliveEnemy: (u) => frontmostAliveEnemy(u, this),
      enemiesWithinRange: (u, r) => enemiesWithinRange(u, r, this),
      highestSlotAliveEnemy: (u) => highestSlotAliveEnemy(u, this),
      alliesBehindWithinRange: (u, r) => alliesBehindWithinRange(u, r, this),
      enemiesWithinForwardRange: (u, r) => enemiesWithinForwardRange(u, r, this),
      moveUnitToBack: (u) => moveUnitToBack(u, this),
      placeAtBackSlot,
      sortBySlot,
      aliveCount,
    };
    this.status = {
      applyPoison: (t, s, src = null) => applyPoison(t, s, this, src),
      setPoison: (t, s, src = null) => setPoison(t, s, this, src),
    };
  }

  // ---------- lifecycle ----------

  run({ player, enemy }) {
    this._initTeams(player, enemy);
    this._fireBattleStart();
    this._mainLoop();
    return this._finalize();
  }

  _initTeams(playerDefs, enemyDefs) {
    this.teams = {
      player: { id: 'player', slots: [] },
      enemy: { id: 'enemy', slots: [] },
    };
    this._populateTeam(this.teams.player, playerDefs, 'player');
    this._populateTeam(this.teams.enemy, enemyDefs, 'enemy');
    this.log.push('battle_init', {
      player: this.teams.player.slots.map((u) => this._snapshot(u)),
      enemy: this.teams.enemy.slots.map((u) => this._snapshot(u)),
      seed: this.rng.seed,
    });
  }

  _populateTeam(team, defs, teamId) {
    if (defs.length > MAX_SLOTS) {
      throw new Error(
        `[CombatCore] team ${teamId} has ${defs.length} units, max is ${MAX_SLOTS}`,
      );
    }
    defs.forEach((def, i) => {
      team.slots.push(this._instantiate(def, teamId, i));
    });
  }

  _instantiate(def, teamId, slot) {
    return {
      unitId: def.id,
      instanceId: def._instanceId ?? null,
      name: def.name ?? def.id,
      team: teamId,
      slot,
      def,
      maxHp: def.hp,
      hp: def.hp,
      baseAtk: def.atk,
      atk: def.atk,
      range: def.range ?? 1,
      faction: def.faction,
      class: def.class,
      statuses: { poison: 0 },
      resonanceStacks: 0,
      usedDeathDefy: false,
      dying: false,
      alive: true,
      skipBasicAttack: !!def.skipBasicAttack,
      flags: {},
    };
  }

  // ---------- team helpers ----------

  ownTeamOf(unit) {
    return unit.team === 'player' ? this.teams.player : this.teams.enemy;
  }

  enemyTeamOf(unit) {
    return unit.team === 'player' ? this.teams.enemy : this.teams.player;
  }

  allUnits() {
    return [...this.teams.player.slots, ...this.teams.enemy.slots];
  }

  bothTeamsAlive() {
    return (
      this.teams.player.slots.some((u) => u.alive) &&
      this.teams.enemy.slots.some((u) => u.alive)
    );
  }

  // ---------- events ----------

  fireEvent(eventType, payload = {}) {
    // Class + faction lifecycle hooks first (registration order = class
    // name then faction name, alphabetical for determinism). Then unit
    // ability handlers on every unit whose ability matches the event.
    const handlers = this._collectHandlers(eventType);
    for (const h of handlers) {
      if (!h.unit.alive && eventType !== EVT.ON_FAINT) continue;
      try {
        h.fn(this, { ...payload, unit: h.unit });
      } catch (e) {
        this.log.push('handler_error', {
          event: eventType,
          unit: h.unit?.unitId,
          error: String(e?.message || e),
        });
        throw e;
      }
    }
  }

  _collectHandlers(eventType) {
    const out = [];
    for (const unit of this.allUnits()) {
      if (!unit.alive && eventType !== EVT.ON_FAINT) continue;
      // Unit ability handler
      const ab = this.registry.getAbility(unit.def.ability_id);
      if (ab && ab.event === eventType) {
        out.push({ unit, fn: ab.fn, priority: ab.priority });
      }
    }
    return out.sort((a, b) => a.priority - b.priority);
  }

  _fireBattleStart() {
    // Class initialize hooks run first (Knight Honorbound, Robot HP, etc.).
    // Then ability on_battle_start handlers (Cloaker venom, Robo Dagger).
    for (const teamKey of ['player', 'enemy']) {
      const team = this.teams[teamKey];
      for (const unit of team.slots) {
        const cls = this.registry.getClass(unit.class);
        if (cls?.initialize) cls.initialize(this, unit);
        const fac = this.registry.getFaction(unit.faction);
        if (fac?.initialize) fac.initialize(this, unit);
      }
    }
    this.log.push('battle_start', { round: 0 });
    this.fireEvent(EVT.BATTLE_START);
    // Battle-start effects may have killed units (e.g., Gunner startup).
    const batch = this._collectInitialKills();
    if (batch.length) this._resolveDeathBatch(batch);
  }

  _collectInitialKills() {
    const batch = [];
    for (const u of this.allUnits()) {
      if (u.alive && u.hp <= 0 && !u.dying) {
        u.dying = true;
        batch.push(u);
      }
    }
    return batch;
  }

  _mainLoop() {
    // SAP tick loop: each iteration is one front-vs-front exchange. Only the
    // frontmost alive unit of each side swings. Both damages are committed
    // before any ON_KILL / ON_FAINT handler fires, so chain attacks from
    // things like Bloodlust happen after the simultaneous exchange lands.
    while (this.bothTeamsAlive() && this.round < MAX_ROUNDS) {
      this.round++;
      this.log.push('round_start', { round: this.round });
      this.fireEvent(EVT.ROUND_START, { round: this.round });

      this._runTick();
      if (!this.bothTeamsAlive()) {
        this.fireEvent(EVT.ROUND_END, { round: this.round });
        this.log.push('round_end', { round: this.round });
        break;
      }

      // Poison now ticks once per front-exchange (was once per multi-action
      // round in the old engine). This is MATERIALLY less frequent, which
      // rebalances poison-heavy units — known gameplay shift.
      const batch = [];
      tickPoison(this, batch);
      if (batch.length) this._resolveDeathBatch(batch);

      this.fireEvent(EVT.ROUND_END, { round: this.round });
      this.log.push('round_end', { round: this.round });
    }
  }

  _runTick() {
    // Capture both fronts up front. If one side is empty, we fall through —
    // the main loop's bothTeamsAlive check ends the battle next iteration.
    // Slot 0 after compaction is always the frontmost alive unit; filter
    // dying defensively in case of pre-tick state.
    const pFront = this.teams.player.slots.find((u) => u.alive && !u.dying) ?? null;
    const eFront = this.teams.enemy.slots.find((u) => u.alive && !u.dying) ?? null;
    if (!pFront || !eFront) return;

    console.log(
      `[CombatCore] tick ${this.round} start — p_front=${pFront.unitId}(hp=${pFront.hp}/atk=${pFront.atk}) e_front=${eFront.unitId}(hp=${eFront.hp}/atk=${eFront.atk})`,
    );

    // Per-action resonance flags scoped to this tick.
    pFront.flags._resonanceGrantedThisAction = false;
    eFront.flags._resonanceGrantedThisAction = false;

    // Consume justReanimated flag regardless of whether the unit acts —
    // reanimated units skip their next tick, same as before.
    const pJustReanimated = !!pFront.flags.justReanimated;
    const eJustReanimated = !!eFront.flags.justReanimated;
    pFront.flags.justReanimated = false;
    eFront.flags.justReanimated = false;

    const pActs = pFront.alive && !pFront.dying && !pFront.skipBasicAttack && !pJustReanimated;
    const eActs = eFront.alive && !eFront.dying && !eFront.skipBasicAttack && !eJustReanimated;

    // Open the tick context so performAttack queues ON_KILL events instead
    // of firing them inline, and skips the mid-swing _resolveDeathBatch call.
    this._tickContext = { pendingKillEvents: [] };

    try {
      // Dispatch both actions. _dispatchAction runs basicAttackOverride,
      // on_action ability, class.onAction, or default basic attack — exactly
      // like today's _takeBasicAction. All nested performAttack calls honor
      // _tickContext automatically.
      if (pActs) this._dispatchAction(pFront);
      if (eActs) this._dispatchAction(eFront);

      // Drain the queued ON_KILL events. Loop until empty so chain-kill
      // abilities (Bloodlust → extra attack → new kill → new ON_KILL) resolve
      // correctly. A dead killer skips its event. Bloodlust's re-entry guard
      // flag ensures chains terminate.
      let drainRounds = 0;
      while (this._tickContext.pendingKillEvents.length > 0) {
        drainRounds++;
        if (drainRounds > 20) {
          console.warn(`[CombatCore] tick ${this.round} kill queue drain exceeded 20 rounds, breaking`);
          break;
        }
        const queue = this._tickContext.pendingKillEvents.splice(0);
        for (const ev of queue) {
          if (!ev.attacker.alive || ev.attacker.dying) continue;
          this.fireEvent(EVT.ON_KILL, ev);
        }
      }

      console.log(
        `[CombatCore] tick ${this.round} kill queue drained after ${drainRounds} round(s)`,
      );
    } finally {
      // Critical: always clear the context, even if a handler threw.
      this._tickContext = null;
    }

    // Resolve all dying units in one batch. _resolveDeathBatch handles
    // ON_FAINT firing (Death-Defy INTERRUPT priority runs first), observer
    // death events, Toxic Cascade, and final removal + compaction.
    const dying = this._collectDying();
    if (dying.length) {
      console.log(
        `[CombatCore] tick ${this.round} resolving ${dying.length} dying: [${dying.map((u) => u.instanceId ?? u.unitId).join(', ')}]`,
      );
      this._resolveDeathBatch(dying);
    }

    console.log(
      `[CombatCore] tick ${this.round} end — p alive=${aliveCount(this.teams.player)} e alive=${aliveCount(this.teams.enemy)}`,
    );
  }

  _collectDying() {
    const out = [];
    for (const u of this.allUnits()) {
      if (u.alive && u.dying) out.push(u);
    }
    return out;
  }

  // ---------- basic action dispatch ----------

  // Renamed from _takeBasicAction — semantics unchanged. Called once per tick
  // per front by _runTick, or standalone in legacy code paths (none currently).
  _dispatchAction(unit) {
    // Per-action resonance flag: grants once per action regardless of how
    // many damage instances the action produces (plan grill rule).
    unit.flags._resonanceGrantedThisAction = false;

    // Unit-level override: Blood King is an Ancient but his basic attack
    // is single-target (Heart Slam fires on death only). The def carries
    // `basicAttackOverride: 'single_target'` for these exceptions.
    if (unit.def.basicAttackOverride === 'single_target') {
      this.log.push('action_start', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        source: 'override_single',
      });
      this._defaultSingleAttack(unit);
      unit.flags._resonanceGrantedThisAction = false;
      return;
    }

    // Ability `on_action` handler wins, then class `onAction`, else default.
    const ab = this.registry.getAbility(unit.def.ability_id);
    if (ab && ab.event === 'on_action') {
      this.log.push('action_start', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        source: 'ability',
        sourceId: ab.id,
      });
      ab.fn(this, { unit });
      unit.flags._resonanceGrantedThisAction = false;
      return;
    }
    const cls = this.registry.getClass(unit.class);
    if (cls?.onAction) {
      this.log.push('action_start', {
        unit: unit.unitId,
        slot: unit.slot,
        team: unit.team,
        source: 'class',
        sourceId: cls.name,
      });
      cls.onAction(this, unit);
      unit.flags._resonanceGrantedThisAction = false;
      return;
    }
    this.log.push('action_start', {
      unit: unit.unitId,
      slot: unit.slot,
      team: unit.team,
      source: 'default',
    });
    this._defaultSingleAttack(unit);
    unit.flags._resonanceGrantedThisAction = false;
  }

  _defaultSingleAttack(attacker) {
    const target = frontmostAliveEnemy(attacker, this);
    if (!target) return;
    this.performAttack(attacker, target, attacker.atk, { kind: 'basic' });
  }

  // ---------- damage / attack ----------

  // Single-target attack entry. Runs before_attack hook (class + ability),
  // resolves Tank Reactive Armor, applies damage, applies Assassin class
  // poison, fires on_hit / on_kill, and resolves the death batch if the
  // target died.
  performAttack(attacker, target, damage, { kind = 'basic' } = {}) {
    if (!attacker?.alive || !target?.alive) return;

    // before_attack hooks can mutate attacker.flags (Gnat Infectious Bite).
    this.fireEvent(EVT.BEFORE_ATTACK, { attacker, target });

    const blocked = this._rollReactiveArmor(target, attacker);
    let actualDamage = 0;
    if (!blocked) {
      actualDamage = damage;
      target.hp -= actualDamage;
    }

    const killed = !blocked && target.hp <= 0;
    this.log.push('attack', {
      attacker: attacker.unitId,
      attackerInstanceId: attacker.instanceId ?? null,
      attackerSlot: attacker.slot,
      attackerTeam: attacker.team,
      target: target.unitId,
      targetInstanceId: target.instanceId ?? null,
      targetSlot: target.slot,
      targetTeam: target.team,
      damage: actualDamage,
      requested: damage,
      blocked,
      damageKind: kind,
      hpAfter: Math.max(0, target.hp),
    });

    // Assassin class poison application (after damage, before on_hit chain).
    if (attacker.class === 'Assassin' && kind === 'basic' && target.alive && target.hp > 0) {
      const override = attacker.flags.infectiousBiteOverride;
      if (override && override > 0) {
        setPoison(target, override, this, attacker);
        attacker.flags.infectiousBiteOverride = 0;
      } else {
        applyPoison(target, 1, this, attacker);
      }
    }

    this.fireEvent(EVT.ON_HIT, { attacker, target, damage: actualDamage, killed });

    // Ancient Resonance: attacker's action grants stacks to other Ancients.
    // One stack per action regardless of damage instances (per grill rule).
    // The per-action flag is managed by _takeBasicAction so AoE attacks
    // hitting multiple targets grant only once.
    if (!attacker.flags._resonanceGrantedThisAction && attacker.class === 'Ancient') {
      this._grantAncientResonance(attacker);
      attacker.flags._resonanceGrantedThisAction = true;
    }

    if (killed && !target.dying) {
      target.dying = true;
      if (this._tickContext) {
        // SAP tick: queue ON_KILL for post-swing drain. The kill does NOT
        // resolve deaths mid-tick; _runTick handles both at end-of-tick.
        this._tickContext.pendingKillEvents.push({ attacker, victim: target });
      } else {
        // Legacy path (battle-start kills, poison ticks via death batch).
        // Fire inline and resolve immediately, same as before.
        this.fireEvent(EVT.ON_KILL, { attacker, victim: target });
        this._resolveDeathBatch([target]);
      }
    }
  }

  // Used by ability handlers (Blood King Heart Slam) or other non-basic
  // damage sources that should still grant resonance exactly once.
  grantResonanceForAction(source) {
    if (source.class !== 'Ancient') return;
    if (source.flags._resonanceGrantedThisAction) return;
    this._grantAncientResonance(source);
    source.flags._resonanceGrantedThisAction = true;
  }

  // Variant for AoE + indirect damage (Minion #002 blast, poison tick, Heart
  // Slam). Skips the before_attack / Assassin poison hook because those are
  // basic-attack-only effects per grill decisions.
  applyDamage(attacker, target, damage, { kind, ignoreArmor = false } = {}) {
    if (!target?.alive) return false;
    const blocked = ignoreArmor ? false : this._rollReactiveArmor(target, attacker);
    let actual = 0;
    if (!blocked) {
      actual = damage;
      target.hp -= actual;
    }
    this.log.push('damage', {
      attacker: attacker ? attacker.unitId : null,
      attackerInstanceId: attacker ? (attacker.instanceId ?? null) : null,
      attackerSlot: attacker ? attacker.slot : null,
      attackerTeam: attacker ? attacker.team : null,
      target: target.unitId,
      targetInstanceId: target.instanceId ?? null,
      targetSlot: target.slot,
      targetTeam: target.team,
      damage: actual,
      requested: damage,
      blocked,
      damageKind: kind,
      hpAfter: Math.max(0, target.hp),
    });
    const killed = !blocked && target.hp <= 0;
    if (killed && !target.dying) {
      target.dying = true;
    }
    return killed;
  }

  _rollReactiveArmor(target, attacker) {
    if (target.class !== 'Tank') return false;
    // Filter dying: a Tank marked dying mid-SAP-tick is about to be removed
    // and shouldn't contribute to the armor-chance pool.
    const tankCount = this.ownTeamOf(target).slots.filter(
      (u) => u.class === 'Tank' && u.alive && !u.dying,
    ).length;
    const chance = Math.min(0.5, 0.1 * tankCount);
    const proc = this.rng.chance(chance);
    this.log.push('reactive_armor_roll', {
      target: target.unitId,
      targetInstanceId: target.instanceId ?? null,
      targetSlot: target.slot,
      targetTeam: target.team,
      attacker: attacker ? attacker.unitId : null,
      attackerInstanceId: attacker ? (attacker.instanceId ?? null) : null,
      tankCount,
      chance,
      proc,
    });
    return proc;
  }

  _grantAncientResonance(source) {
    // Everyone with class=Ancient on source's team EXCEPT source gains +1.
    // Dying Ancients (mid-tick) are about to be removed — skip them.
    const team = this.ownTeamOf(source);
    for (const u of team.slots) {
      if (u === source) continue;
      if (!u.alive || u.dying) continue;
      if (u.class !== 'Ancient') continue;
      if (u.resonanceStacks >= 5) continue;
      u.resonanceStacks++;
      u.atk = u.baseAtk + u.resonanceStacks + (u.flags._staticBonusAtk || 0);
      this.log.push('resonance_stack', {
        source: source.unitId,
        sourceInstanceId: source.instanceId ?? null,
        sourceSlot: source.slot,
        sourceTeam: source.team,
        target: u.unitId,
        targetInstanceId: u.instanceId ?? null,
        targetSlot: u.slot,
        targetTeam: u.team,
        stacks: u.resonanceStacks,
        newAtk: u.atk,
      });
    }
  }

  // ---------- death batch ----------

  _resolveDeathBatch(initialKills) {
    let queue = sortBySlot(initialKills);
    let processed = 0;
    while (queue.length > 0) {
      processed++;
      if (processed > DEATH_BATCH_WARN) {
        this.log.push('death_batch_warning', { processed, pending: queue.length });
      }
      const unit = queue.shift();
      if (!unit.dying) continue; // Archer interrupt may have cleared it.
      // Fire on_faint for this unit (ability + class + faction in that order).
      this._fireFaintHandlers(unit, queue);

      // Also fire reactive "any enemy death" handlers (Hog Knight) and
      // "ally death" handlers (Relic Guardian 3). These observe the death
      // regardless of whether the unit was ultimately saved (so they fire
      // only if dying is still true at this point — i.e., the unit is
      // actually going to be removed).
      if (unit.dying) {
        this._fireDeathObservers(unit, queue);
      }

      // Toxic Cascade fires if the dying unit carried poison AND dying is
      // still true at this point.
      if (unit.dying) {
        rollToxicCascade(unit, this, queue);
      }

      // Collect any newly lethal units caused by handlers and append to queue.
      for (const u of this.allUnits()) {
        if (u.alive && u.hp <= 0 && !u.dying) {
          u.dying = true;
          queue.push(u);
        }
      }
      queue = sortBySlot(queue);
    }

    // End of batch: remove all units still flagged dying. Then compact.
    let removed = 0;
    for (const teamKey of ['player', 'enemy']) {
      const team = this.teams[teamKey];
      for (const u of team.slots) {
        if (u.dying) {
          u.alive = false;
          removed++;
          this.log.push('faint_final', {
            unit: u.unitId,
            instanceId: u.instanceId ?? null,
            slot: u.slot,
            team: u.team,
          });
        }
      }
    }
    if (removed > 0) {
      compactBothTeams(this.teams);
      this.log.push('compact', {
        player: this.teams.player.slots.map((u) => ({
          unitId: u.unitId,
          instanceId: u.instanceId ?? null,
          slot: u.slot,
        })),
        enemy: this.teams.enemy.slots.map((u) => ({
          unitId: u.unitId,
          instanceId: u.instanceId ?? null,
          slot: u.slot,
        })),
      });
    }
  }

  _fireFaintHandlers(unit, queue) {
    this.log.push('faint_start', {
      unit: unit.unitId,
      instanceId: unit.instanceId ?? null,
      slot: unit.slot,
      team: unit.team,
    });
    // Ability handler first (Archer Death-Defy is an ability — runs early).
    const ab = this.registry.getAbility(unit.def.ability_id);
    if (ab && ab.event === EVT.ON_FAINT) {
      ab.fn(this, { unit, queue });
    }
    // Class handler (Ancient: Blood King's case is handled via his ability,
    // not the class — class has no on_faint).
    const cls = this.registry.getClass(unit.class);
    if (cls?.onFaint) cls.onFaint(this, unit);
    // Faction handler (Monster reanimate).
    const fac = this.registry.getFaction(unit.faction);
    if (fac?.onFaint) fac.onFaint(this, unit);
  }

  _fireDeathObservers(victim, queue) {
    // Fire "any_death" handlers on every OTHER living unit on either team.
    // (Observer-style — Hog Knight's Ricochet Shot.)
    for (const observer of this.allUnits()) {
      if (observer === victim) continue;
      if (!observer.alive || observer.dying) continue;
      const ab = this.registry.getAbility(observer.def.ability_id);
      if (!ab) continue;
      if (ab.event === EVT.ON_ANY_DEATH) {
        ab.fn(this, { observer, victim });
      } else if (
        ab.event === EVT.ON_ALLY_DEATH &&
        observer.team === victim.team &&
        (!ab.filter || ab.filter(observer, victim))
      ) {
        ab.fn(this, { observer, victim });
      }
    }
  }

  // ---------- finalize ----------

  _finalize() {
    this.fireEvent(EVT.BATTLE_END);
    const pAlive = this.teams.player.slots.some((u) => u.alive);
    const eAlive = this.teams.enemy.slots.some((u) => u.alive);
    let winner;
    if (pAlive && !eAlive) winner = 'player';
    else if (!pAlive && eAlive) winner = 'enemy';
    else winner = 'draw';
    this.log.push('battle_end', {
      winner,
      rounds: this.round,
      playerSurvivors: this.teams.player.slots.map((u) => this._snapshot(u)),
      enemySurvivors: this.teams.enemy.slots.map((u) => this._snapshot(u)),
    });
    return {
      winner,
      rounds: this.round,
      log: this.log,
      teams: this.teams,
    };
  }

  _snapshot(unit) {
    return {
      unitId: unit.unitId,
      instanceId: unit.instanceId ?? null,
      slot: unit.slot,
      team: unit.team,
      hp: unit.hp,
      atk: unit.atk,
      alive: unit.alive,
      poison: unit.statuses.poison || 0,
      resonance: unit.resonanceStacks || 0,
    };
  }
}
