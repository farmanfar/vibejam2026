// BattleSceneAdapter bridges CombatCore (headless alpha engine) into the
// BattleScene step playback loop.
//
// Output shape matches what BattleScene consumes from the legacy engine:
//
//   {
//     won: boolean,
//     log: Array<{
//       message: string,
//       playerHp?: number[],
//       enemyHp?: number[],
//       playerAtk?: number[],
//       enemyAtk?: number[],
//       actorInstanceId?: string,
//       targetInstanceId?: string,
//       animTag?: 'attack' | 'death' | 'special attack',
//       flavorEvents?: Array<{ type, targetInstanceId, text }>
//     }>,
//     playerTeam,
//     enemyTeam,
//   }
//
// Stable identity: each team entry is stamped with a `_instanceId` before the
// sim runs. CombatCore copies it onto the instantiated unit (instanceId field)
// and emits it on all relevant log entries. After compaction a sprite lookup
// by instanceId still resolves correctly; slot index is unreliable.

import { CombatCore } from './CombatCore.js';
import { buildRegistry } from './index.js';

let _registry = null;
function getRegistry() {
  if (!_registry) {
    _registry = buildRegistry();
    console.log('[AlphaAdapter] Registry built (cold cache)');
  }
  return _registry;
}

function toCoreDef(w) {
  return {
    id: w.id,
    _instanceId: w._instanceId,
    name: w.name,
    faction: w.faction,
    class: w.class,
    tier: w.tier,
    hp: w.hp,
    atk: w.atk,
    range: w.range ?? 1,
    ability_id: w.ability_id ?? null,
    skipBasicAttack: !!w.skipBasicAttack,
    basicAttackOverride: w.basicAttackOverride ?? null,
  };
}

function humanizeAbilityKind(kind) {
  return String(kind)
    .replace(/_(start|trigger|repositioned|success|aoe|final)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

export function runAlphaBattle(playerTeam, enemyTeam, seed = (Date.now() & 0xffffffff)) {
  console.log(
    `[AlphaAdapter] runAlphaBattle - ${playerTeam.length} vs ${enemyTeam.length}, seed=${seed}`,
  );

  const p = playerTeam.map((w, i) => ({ ...w, _instanceId: `p${i}` }));
  const e = enemyTeam.map((w, i) => ({ ...w, _instanceId: `e${i}` }));

  const core = new CombatCore({ registry: getRegistry(), seed });
  let result;
  try {
    result = core.run({
      player: p.map(toCoreDef),
      enemy: e.map(toCoreDef),
    });
  } catch (err) {
    console.error('[AlphaAdapter] CombatCore.run threw - falling back to empty result:', err);
    return {
      won: false,
      log: [{ message: 'BATTLE ERROR' }],
      rawLog: [],
      seed: null,
      winner: 'draw',
      rounds: 0,
      playerTeam,
      enemyTeam,
    };
  }

  const translated = translateLog(result.log.entries, p, e);
  const won = result.winner === 'player';
  console.log(
    `[AlphaAdapter] Translated ${result.log.entries.length} raw log entries -> ${translated.length} visual steps; winner=${result.winner}`,
  );

  return {
    won,
    log: translated,
    rawLog: result.log.entries,
    seed,
    winner: result.winner,
    rounds: result.rounds,
    playerTeam,
    enemyTeam,
  };
}

function translateLog(rawEntries, playerTeamStamped, enemyTeamStamped) {
  const byInstance = new Map();
  playerTeamStamped.forEach((w, i) => {
    byInstance.set(w._instanceId, { team: 'player', index: i, unit: w });
  });
  enemyTeamStamped.forEach((w, i) => {
    byInstance.set(w._instanceId, { team: 'enemy', index: i, unit: w });
  });

  const playerHp = playerTeamStamped.map((w) => w.hp);
  const enemyHp = enemyTeamStamped.map((w) => w.hp);
  const playerAtk = playerTeamStamped.map((w) => w.atk);
  const enemyAtk = enemyTeamStamped.map((w) => w.atk);

  const applyHp = (instanceId, hpAfter) => {
    const lookup = byInstance.get(instanceId);
    if (!lookup) return;
    const arr = lookup.team === 'player' ? playerHp : enemyHp;
    arr[lookup.index] = Math.max(0, hpAfter);
  };

  const applyAtk = (instanceId, atkAfter) => {
    const lookup = byInstance.get(instanceId);
    if (!lookup) return;
    const arr = lookup.team === 'player' ? playerAtk : enemyAtk;
    arr[lookup.index] = Math.max(0, atkAfter);
  };

  const snapshotStats = () => ({
    playerHp: playerHp.slice(),
    enemyHp: enemyHp.slice(),
    playerAtk: playerAtk.slice(),
    enemyAtk: enemyAtk.slice(),
  });

  const nameOf = (instanceId) => {
    const lookup = byInstance.get(instanceId);
    return lookup?.unit?.name ?? instanceId ?? '?';
  };

  const steps = [];
  const unhandled = new Set();
  let battleInitPending = false;
  let tick = null;

  const emitFlavor = (message, flavorEvent = null) => {
    if (tick) {
      tick.flavorMessages.push(message);
      if (flavorEvent) tick.flavorEvents.push(flavorEvent);
      return;
    }
    const step = { message, ...snapshotStats() };
    if (flavorEvent) step.flavorEvents = [flavorEvent];
    steps.push(step);
  };

  const emitBattleInit = () => {
    if (!battleInitPending) return;
    steps.push({
      message: 'The battle begins!',
      flavorEvents: [],
      ...snapshotStats(),
    });
    battleInitPending = false;
  };

  const openTick = (tickId) => {
    tick = {
      tickId,
      attacks: [],
      flavorMessages: [],
      flavorEvents: [],
      postSteps: [],
    };
  };

  const flushTick = () => {
    if (!tick) return;
    let playerAttack = null;
    let enemyAttack = null;
    for (const attack of tick.attacks) {
      if (!attack.actorInstanceId) continue;
      if (attack.actorInstanceId.startsWith('p') && !playerAttack) playerAttack = attack;
      else if (attack.actorInstanceId.startsWith('e') && !enemyAttack) enemyAttack = attack;
    }
    const parts = [];
    if (playerAttack) parts.push(playerAttack.message);
    if (enemyAttack) parts.push(enemyAttack.message);
    const message = parts.join('   |   ') || `TICK ${tick.tickId}`;
    steps.push({
      type: 'tick',
      tickId: tick.tickId,
      message,
      playerAttack,
      enemyAttack,
      flavorMessages: tick.flavorMessages.slice(),
      flavorEvents: tick.flavorEvents.slice(),
      ...snapshotStats(),
    });
    // Group all deaths from this tick into one death_batch step so the
    // renderer can play every death animation in parallel. Non-death post
    // steps (death-defy revives, reanimate_success, etc.) keep firing in
    // their original order.
    const tickDeaths = [];
    for (const post of tick.postSteps) {
      if (post.diedInstanceId) tickDeaths.push(post);
      else steps.push(post);
    }
    if (tickDeaths.length > 0) {
      steps.push({
        type: 'death_batch',
        tickId: tick.tickId,
        deaths: tickDeaths,
        message: tickDeaths.map((d) => d.message).filter(Boolean).join('. '),
        ...snapshotStats(),
      });
    }
    tick = null;
  };

  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    const kind = entry.kind;

    switch (kind) {
      case 'battle_init':
        battleInitPending = true;
        break;
      case 'battle_start':
        break;
      case 'round_start':
        if (tick) flushTick();
        emitBattleInit();
        openTick(entry.round);
        break;
      case 'coin_flip':
      case 'action_start':
        break;
      case 'knight_honorbound_init':
      case 'grunt_synergy_init':
        if (entry.instanceId) {
          if (typeof entry.newHp === 'number') applyHp(entry.instanceId, entry.newHp);
          if (typeof entry.newAtk === 'number') applyAtk(entry.instanceId, entry.newAtk);
        }
        break;
      case 'berserker_synergy_init':
        if (entry.instanceId && typeof entry.newAtk === 'number') {
          applyAtk(entry.instanceId, entry.newAtk);
        }
        break;
      case 'attack': {
        if (typeof entry.hpAfter === 'number' && entry.targetInstanceId) {
          applyHp(entry.targetInstanceId, entry.hpAfter);
        }
        const atkName = nameOf(entry.attackerInstanceId);
        const tgtName = nameOf(entry.targetInstanceId);
        let attackMsg;
        if (entry.blocked) {
          attackMsg = `${atkName} attacks ${tgtName} — blocked`;
        } else {
          const hpAfter = typeof entry.hpAfter === 'number' ? entry.hpAfter : null;
          const result = hpAfter === null ? '' : hpAfter <= 0 ? 'dead' : `${hpAfter} health remaining`;
          attackMsg = result
            ? `${atkName} hits ${tgtName} for ${entry.damage}, ${result}`
            : `${atkName} hits ${tgtName} for ${entry.damage}`;
        }
        const attack = {
          message: attackMsg,
          actorInstanceId: entry.attackerInstanceId ?? null,
          targetInstanceId: entry.targetInstanceId ?? null,
          damage: entry.damage ?? 0,
          blocked: !!entry.blocked,
          animTag: 'attack',
        };
        if (tick) {
          tick.attacks.push(attack);
        } else {
          steps.push({
            ...attack,
            flavorEvents: [],
            ...snapshotStats(),
          });
        }
        break;
      }
      case 'damage':
        if (typeof entry.hpAfter === 'number' && entry.targetInstanceId) {
          applyHp(entry.targetInstanceId, entry.hpAfter);
        }
        emitFlavor(`${nameOf(entry.targetInstanceId)} takes ${entry.damage}`);
        break;
      case 'reactive_armor_roll':
        if (entry.proc) {
          const label = entry.targetInstanceId ? nameOf(entry.targetInstanceId) : (entry.target ?? 'unit');
          emitFlavor(`${label} armored!`, {
            type: 'armor',
            targetInstanceId: entry.targetInstanceId ?? null,
            text: 'ARMORED',
          });
        }
        break;
      case 'resonance_stack': {
        if (entry.targetInstanceId && typeof entry.newAtk === 'number') {
          applyAtk(entry.targetInstanceId, entry.newAtk);
        }
        const label = entry.targetInstanceId ? nameOf(entry.targetInstanceId) : (entry.target ?? 'unit');
        emitFlavor(`${label} resonance ${entry.stacks}`, {
          type: 'resonance',
          targetInstanceId: entry.targetInstanceId ?? null,
          text: '+1 ATK',
        });
        break;
      }
      case 'folk_death_buff':
        if (entry.recipientInstanceId && typeof entry.newAtk === 'number') {
          applyAtk(entry.recipientInstanceId, entry.newAtk);
        }
        emitFlavor(`${nameOf(entry.recipientInstanceId ?? entry.recipient)} +1 ATK`, {
          type: 'buff',
          targetInstanceId: entry.recipientInstanceId ?? null,
          text: '+1 ATK',
        });
        break;
      case 'reactive_reinforcement_proc':
        if (entry.instanceId && typeof entry.newAtk === 'number') {
          applyAtk(entry.instanceId, entry.newAtk);
        }
        emitFlavor(`${nameOf(entry.instanceId ?? entry.unit)} +1 ATK`, {
          type: 'buff',
          targetInstanceId: entry.instanceId ?? null,
          text: '+1 ATK',
        });
        break;
      case 'sacrifice_pass_proc':
        if (entry.recipientInstanceId && typeof entry.newAtk === 'number') {
          applyAtk(entry.recipientInstanceId, entry.newAtk);
        }
        emitFlavor(`${nameOf(entry.recipientInstanceId ?? entry.recipient)} +1 ATK`, {
          type: 'buff',
          targetInstanceId: entry.recipientInstanceId ?? null,
          text: '+1 ATK',
        });
        break;
      case 'apply_poison':
      case 'set_poison': {
        const applied = Math.max(0, (entry.after ?? 0) - (entry.before ?? 0));
        const label = nameOf(entry.targetInstanceId ?? entry.target);
        emitFlavor(
          `${label} poison ${entry.after ?? entry.stacks ?? entry.amount ?? 1}`,
          applied > 0
            ? {
                type: 'poison',
                targetInstanceId: entry.targetInstanceId ?? null,
                text: `+${applied}`,
              }
            : null,
        );
        break;
      }
      case 'poison_tick': {
        if (typeof entry.hpAfter === 'number' && entry.targetInstanceId) {
          applyHp(entry.targetInstanceId, entry.hpAfter);
        }
        const label = nameOf(entry.targetInstanceId ?? entry.target);
        emitFlavor(`${label} poison ${entry.stacks ?? entry.amount ?? 1}`, {
          type: 'poison',
          targetInstanceId: entry.targetInstanceId ?? null,
          text: `-${entry.damage ?? 0}`,
        });
        break;
      }
      case 'cascade_bounce':
        emitFlavor(`${nameOf(entry.targetInstanceId ?? entry.target)} toxic cascade`, {
          type: 'poison',
          targetInstanceId: entry.targetInstanceId ?? null,
          text: 'CASCADE',
        });
        break;
      case 'faint_start':
        break;
      case 'faint_final': {
        applyHp(entry.instanceId, 0);
        const deathStep = {
          message: '',
          diedInstanceId: entry.instanceId ?? null,
          targetInstanceId: entry.instanceId ?? null,
          animTag: 'death',
          flavorEvents: [],
          ...snapshotStats(),
        };
        if (tick) tick.postSteps.push(deathStep);
        else steps.push(deathStep);
        break;
      }
      case 'compact':
        break;
      case 'round_end':
        flushTick();
        break;
      case 'death_defy_trigger': {
        const restoredHp = typeof entry.newHp === 'number' ? entry.newHp : 1;
        if (entry.instanceId) applyHp(entry.instanceId, restoredHp);
        const reviveStep = {
          message: `${nameOf(entry.instanceId ?? entry.unit)} - death defying!`,
          revivedInstanceId: entry.instanceId ?? null,
          flavorEvents: [{
            type: 'buff',
            targetInstanceId: entry.instanceId ?? null,
            text: 'DEATH DEFY',
          }],
          ...snapshotStats(),
        };
        if (tick) tick.postSteps.push(reviveStep);
        else steps.push(reviveStep);
        break;
      }
      case 'death_defy_repositioned':
      case 'death_defy_aoe':
        break;
      case 'heart_slam_start':
        emitFlavor(`${nameOf(entry.instanceId ?? entry.unit)} - heart slam!`);
        break;
      case 'reanimate_success': {
        if (entry.instanceId) applyHp(entry.instanceId, entry.newHp ?? 1);
        const reviveStep = {
          message: `${nameOf(entry.instanceId ?? entry.unit)} reanimates!`,
          revivedInstanceId: entry.instanceId ?? null,
          flavorEvents: [{
            type: 'buff',
            targetInstanceId: entry.instanceId ?? null,
            text: 'REANIMATE',
          }],
          ...snapshotStats(),
        };
        if (tick) tick.postSteps.push(reviveStep);
        else steps.push(reviveStep);
        break;
      }
      case 'reanimate_roll':
      case 'reanimate_failed_slot_full':
      case 'reanimate_failed_slot_full_race':
        break;
      case 'battle_end':
        emitBattleInit();
        if (tick) flushTick();
        steps.push({
          message: entry.winner === 'player' ? 'Your team wins!' : entry.winner === 'enemy' ? 'Your team was defeated.' : 'Draw.',
          flavorEvents: [],
          ...snapshotStats(),
        });
        break;
      default:
        if (/_start$/i.test(kind) && (entry.unit || entry.instanceId)) {
          emitFlavor(`${nameOf(entry.instanceId ?? entry.unit)} - ${humanizeAbilityKind(kind)}`);
        } else if (!unhandled.has(kind)) {
          unhandled.add(kind);
          console.debug('[AlphaAdapter] unhandled log kind', kind);
        }
        break;
    }
  }

  emitBattleInit();
  if (tick) flushTick();

  return steps;
}
