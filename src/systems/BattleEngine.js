import { getEnabledAlphaWarriors as getEnabledWarriors, SYNERGIES } from '../config/alpha-units.js';

// LEGACY — BattleEngine.resolve() is superseded by
// src/systems/combat/BattleSceneAdapter.js `runAlphaBattle` inside BattleScene.
// Only `generateEnemyTeam` is still used (GhostManager synthetic fallback).
export class BattleEngine {
  generateEnemyTeam(stage) {
    const teamSize = Math.min(5, 1 + Math.floor(stage / 2));
    // Alpha roster has NO tier 0 — lowest is tier 1. Clamp so stage 1/2
    // can still roll from the tier-1 pool.
    const maxTier = Math.max(1, Math.min(4, Math.floor(stage / 2)));
    const pool = getEnabledWarriors().filter(w => w.tier <= maxTier);
    if (pool.length === 0) return [];

    const team = [];
    for (let i = 0; i < teamSize; i++) {
      const base = pool[Math.floor(Math.random() * pool.length)];
      team.push({
        ...base,
        hp: base.hp + Math.floor(stage * 0.5),
        atk: base.atk + Math.floor(stage * 0.3),
      });
    }
    return team;
  }

  /**
   * Resolve a battle between two teams.
   * @param {Array} playerTeam - array of warrior objects
   * @param {Array} enemyTeam - array of warrior objects
   * @returns {{ won: boolean, log: Array }}
   */
  resolve(playerTeam, enemyTeam) {
    // Clone with current HP
    const pTeam = playerTeam.map(w => ({ ...w, currentHp: w.hp }));
    const eTeam = enemyTeam.map(w => ({ ...w, currentHp: w.hp }));

    // Apply synergy bonuses
    this._applySynergies(pTeam);
    this._applySynergies(eTeam);

    const log = [];
    let turn = 0;
    const maxTurns = 50; // prevent infinite

    while (turn < maxTurns) {
      // Find front-most alive
      const pAttacker = pTeam.find(w => w.currentHp > 0);
      const eAttacker = eTeam.find(w => w.currentHp > 0);

      if (!pAttacker || !eAttacker) break;

      // Player attacks
      const pDmg = Math.max(1, pAttacker.atk);
      eAttacker.currentHp -= pDmg;
      log.push({
        message: `${pAttacker.name} deals ${pDmg} to ${eAttacker.name}!`,
        playerHp: pTeam.map(w => w.currentHp),
        enemyHp: eTeam.map(w => w.currentHp),
      });

      if (eAttacker.currentHp <= 0) {
        log.push({
          message: `${eAttacker.name} destroyed!`,
          playerHp: pTeam.map(w => w.currentHp),
          enemyHp: eTeam.map(w => w.currentHp),
        });
        if (!eTeam.some(w => w.currentHp > 0)) break;
      }

      // Enemy attacks
      const eTarget = pTeam.find(w => w.currentHp > 0);
      if (!eTarget) break;

      const eDmg = Math.max(1, (eTeam.find(w => w.currentHp > 0)?.atk ?? 1));
      eTarget.currentHp -= eDmg;
      log.push({
        message: `${eTeam.find(w => w.currentHp > 0)?.name ?? 'Enemy'} deals ${eDmg} to ${eTarget.name}!`,
        playerHp: pTeam.map(w => w.currentHp),
        enemyHp: eTeam.map(w => w.currentHp),
      });

      if (eTarget.currentHp <= 0) {
        log.push({
          message: `${eTarget.name} falls!`,
          playerHp: pTeam.map(w => w.currentHp),
          enemyHp: eTeam.map(w => w.currentHp),
        });
      }

      turn++;
    }

    const won = eTeam.every(w => w.currentHp <= 0) && pTeam.some(w => w.currentHp > 0);

    return { won, log, playerTeam: pTeam, enemyTeam: eTeam };
  }

  _applySynergies(team) {
    // Count factions
    const counts = {};
    team.forEach(w => {
      if (w.faction) counts[w.faction] = (counts[w.faction] || 0) + 1;
    });

    // Apply bonuses
    for (const [faction, count] of Object.entries(counts)) {
      const synergyDef = SYNERGIES[faction];
      if (!synergyDef) continue;

      // Find highest threshold met
      let bonus = null;
      for (const threshold of [4, 3, 2]) {
        if (count >= threshold && synergyDef[threshold]) {
          bonus = synergyDef[threshold];
          break;
        }
      }
      if (!bonus) continue;

      // Apply to all warriors of that faction
      team.forEach(w => {
        if (w.faction === faction) {
          if (bonus.atk) w.atk += bonus.atk;
          if (bonus.hp) {
            w.hp += bonus.hp;
            w.currentHp += bonus.hp;
          }
        }
      });
    }
  }
}
