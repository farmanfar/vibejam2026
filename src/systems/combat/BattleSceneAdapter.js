// BattleSceneAdapter — bridges CombatCore (headless alpha engine) into the
// BattleScene step playback loop.
//
//   import { runAlphaBattle } from '../systems/combat/BattleSceneAdapter.js'
//   const result = runAlphaBattle(playerTeam, enemyTeam, seed)
//
// Output shape matches what BattleScene already consumes from BattleEngine:
//
//   {
//     won:         boolean,
//     log:         Array<{
//                    message: string,
//                    playerHp?: number[],  // indexed by ORIGINAL team position
//                    enemyHp?:  number[],
//                    actorInstanceId?: string,
//                    targetInstanceId?: string,
//                    animTag?: 'attack' | 'death' | 'special attack',
//                  }>,
//     playerTeam,  // pass-through
//     enemyTeam,
//   }
//
// Stable identity: each team entry is stamped with a `_instanceId` before the
// sim runs. CombatCore copies it onto the instantiated unit (instanceId field)
// and emits it on all relevant log entries (`attackerInstanceId`,
// `targetInstanceId`, `instanceId`). After compaction a sprite lookup by
// instanceId still resolves correctly — the slot index is unreliable.
//
// `playerHp[]` / `enemyHp[]` are keyed by the unit's ORIGINAL position in the
// input team array (the same index BattleScene used when laying out sprites).
// A shadow HP map keyed by instanceId mirrors CombatCore's damage emissions
// and is projected back into the original-order arrays at each emit point.

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
  // 'heart_slam_start' -> 'heart slam'
  return String(kind)
    .replace(/_(start|trigger|repositioned|success|aoe|final)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

export function runAlphaBattle(playerTeam, enemyTeam, seed = (Date.now() & 0xffffffff)) {
  console.log(
    `[AlphaAdapter] runAlphaBattle — ${playerTeam.length} vs ${enemyTeam.length}, seed=${seed}`,
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
    console.error('[AlphaAdapter] CombatCore.run threw — falling back to empty result:', err);
    return {
      won: false,
      log: [{ message: 'BATTLE ERROR' }],
      playerTeam,
      enemyTeam,
    };
  }

  const translated = translateLog(result.log.entries, p, e);
  const won = result.winner === 'player';
  console.log(
    `[AlphaAdapter] Translated ${result.log.entries.length} raw log entries -> ${translated.length} visual steps; winner=${result.winner}`,
  );

  return { won, log: translated, playerTeam, enemyTeam };
}

// ---- log translation ------------------------------------------------------

function translateLog(rawEntries, playerTeamStamped, enemyTeamStamped) {
  // Lookup tables — instanceId -> { team, originalIndex, unitDef }.
  const byInstance = new Map();
  playerTeamStamped.forEach((w, i) => {
    byInstance.set(w._instanceId, { team: 'player', index: i, unit: w });
  });
  enemyTeamStamped.forEach((w, i) => {
    byInstance.set(w._instanceId, { team: 'enemy', index: i, unit: w });
  });

  // Shadow HP arrays keyed by ORIGINAL position. HP is allowed to hit 0
  // briefly (between lethal damage and faint_final) without committing a
  // visual death — the adapter only commits on `faint_final`, which is
  // AFTER Death-Defy / Monster reanimate have had a chance to restore HP.
  const playerHp = playerTeamStamped.map((w) => w.hp);
  const enemyHp = enemyTeamStamped.map((w) => w.hp);

  const applyHp = (instanceId, hpAfter) => {
    const lookup = byInstance.get(instanceId);
    if (!lookup) return;
    const arr = lookup.team === 'player' ? playerHp : enemyHp;
    arr[lookup.index] = Math.max(0, hpAfter);
  };

  const snapshotHp = () => ({
    playerHp: playerHp.slice(),
    enemyHp: enemyHp.slice(),
  });

  const nameOf = (instanceId) => {
    const l = byInstance.get(instanceId);
    return l?.unit?.name ?? instanceId ?? '?';
  };

  const steps = [];
  const unhandled = new Set();

  // Some log kinds need coalescing — an `attack` entry is immediately followed
  // by a `damage` entry for the same pair. We peek/merge to emit a single
  // visual step with both the message and the HP snapshot.
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    const kind = entry.kind;

    switch (kind) {
      case 'battle_init': {
        steps.push({
          message: 'BATTLE START',
          ...snapshotHp(),
        });
        break;
      }
      case 'battle_start':
        // suppressed — covered by 'battle_init' visual
        break;
      case 'round_start':
        if (entry.round > 1) {
          steps.push({ message: `ROUND ${entry.round}`, ...snapshotHp() });
        }
        break;
      case 'coin_flip':
      case 'action_start':
        break;
      case 'attack': {
        // Reflect hpAfter on the target.
        if (typeof entry.hpAfter === 'number' && entry.targetInstanceId) {
          applyHp(entry.targetInstanceId, entry.hpAfter);
        }
        const atkName = nameOf(entry.attackerInstanceId);
        const tgtName = nameOf(entry.targetInstanceId);
        const dmgTxt = entry.blocked ? 'BLOCKED' : `${entry.damage}`;
        steps.push({
          message: `${atkName} -> ${tgtName} (${dmgTxt})`,
          actorInstanceId: entry.attackerInstanceId ?? null,
          targetInstanceId: entry.targetInstanceId ?? null,
          animTag: 'attack',
          ...snapshotHp(),
        });
        break;
      }
      case 'damage': {
        if (typeof entry.hpAfter === 'number' && entry.targetInstanceId) {
          applyHp(entry.targetInstanceId, entry.hpAfter);
        }
        const tgtName = nameOf(entry.targetInstanceId);
        steps.push({
          message: `${tgtName} takes ${entry.damage}`,
          targetInstanceId: entry.targetInstanceId ?? null,
          ...snapshotHp(),
        });
        break;
      }
      case 'reactive_armor_roll': {
        if (entry.proc) {
          const label = entry.targetInstanceId
            ? nameOf(entry.targetInstanceId)
            : (entry.target ?? 'unit');
          steps.push({
            message: `${label} armored!`,
            ...snapshotHp(),
          });
        }
        break;
      }
      case 'resonance_stack': {
        const label = entry.targetInstanceId
          ? nameOf(entry.targetInstanceId)
          : (entry.target ?? 'unit');
        steps.push({
          message: `${label} resonance ${entry.stacks}`,
        });
        break;
      }
      case 'apply_poison':
      case 'poison_tick': {
        const n = entry.stacks ?? entry.amount ?? 1;
        steps.push({
          message: `${nameOf(entry.targetInstanceId ?? entry.target)} poison ${n}`,
          ...snapshotHp(),
        });
        break;
      }
      case 'faint_start':
        // Suppressed. CombatCore fires faint_start BEFORE interrupt
        // handlers (Death-Defy, Monster reanimate) run. If we committed
        // the death here we'd desync the UI when those handlers save the
        // unit. The commit lives on `faint_final` instead, which is
        // emitted only for units that are still dying at end-of-batch.
        break;
      case 'faint_final': {
        // Commit death: CombatCore has finished the batch and this unit
        // was NOT saved. Dim the sprite, play the death anim, leave HP
        // at 0 in the shadow map.
        applyHp(entry.instanceId, 0);
        steps.push({
          message: `${nameOf(entry.instanceId)} destroyed!`,
          diedInstanceId: entry.instanceId ?? null,
          targetInstanceId: entry.instanceId ?? null,
          animTag: 'death',
          ...snapshotHp(),
        });
        break;
      }
      case 'compact':
        // internal bookkeeping — suppressed (sprite identity by instanceId,
        // so compaction does not affect the visual layout).
        break;
      case 'round_end':
        break;
      case 'death_defy_trigger': {
        // Archer saved — restore shadow HP from the engine's reported
        // newHp (no hardcoded constant; tracks whatever value the ability
        // handler assigned). Keeps the UI correct if the revive value
        // changes later.
        const restoredHp = typeof entry.newHp === 'number' ? entry.newHp : 1;
        if (entry.instanceId) applyHp(entry.instanceId, restoredHp);
        steps.push({
          message: `${nameOf(entry.instanceId ?? entry.unit)} — death defying!`,
          revivedInstanceId: entry.instanceId ?? null,
          ...snapshotHp(),
        });
        break;
      }
      case 'death_defy_repositioned':
        // Text/animation already emitted by the trigger step above.
        break;
      case 'death_defy_aoe':
        break;
      case 'heart_slam_start': {
        steps.push({
          message: `${nameOf(entry.instanceId ?? entry.unit)} — heart slam!`,
          ...snapshotHp(),
        });
        break;
      }
      case 'reanimate_success': {
        // Monster reanimate: unit was dying but is restored to full HP
        // before faint_final commits. Restore shadow HP so the sprite
        // stays alive in the visual timeline.
        if (entry.instanceId) applyHp(entry.instanceId, entry.newHp ?? 1);
        steps.push({
          message: `${nameOf(entry.instanceId ?? entry.unit)} reanimates!`,
          revivedInstanceId: entry.instanceId ?? null,
          ...snapshotHp(),
        });
        break;
      }
      case 'reanimate_roll':
      case 'reanimate_failed_slot_full':
      case 'reanimate_failed_slot_full_race':
        // Non-commit rolls; suppressed.
        break;
      case 'battle_end': {
        steps.push({
          message: entry.winner === 'player' ? 'VICTORY' : entry.winner === 'enemy' ? 'DEFEAT' : 'DRAW',
          ...snapshotHp(),
        });
        break;
      }
      default: {
        // Generic ability_*_start style — humanize and surface as text.
        if (/_start$/i.test(kind) && (entry.unit || entry.instanceId)) {
          steps.push({
            message: `${nameOf(entry.instanceId ?? entry.unit)} — ${humanizeAbilityKind(kind)}`,
            ...snapshotHp(),
          });
        } else if (!unhandled.has(kind)) {
          unhandled.add(kind);
          console.debug('[AlphaAdapter] unhandled log kind', kind);
        }
        break;
      }
    }
  }

  return steps;
}
