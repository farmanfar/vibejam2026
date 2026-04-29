export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first battle.',
    icon: 'Icon1',
    hidden: false,
    category: 'battle',
    evaluate(stats, _event) {
      return stats.lifetime.battlesWon >= 1;
    },
  },
  {
    id: 'triple_threat',
    name: 'Triple Threat',
    description: 'Reach 3 wins in a single run.',
    icon: 'Icon1',
    hidden: false,
    category: 'run',
    evaluate(stats, _event) {
      return stats.run.wins >= 3;
    },
  },
  {
    id: 'champion',
    name: 'Champion',
    description: 'Win a full run (9 wins).',
    icon: 'Icon1',
    hidden: false,
    category: 'run',
    evaluate(_stats, event) {
      return event.type === 'champion';
    },
  },
  {
    id: 'big_spender',
    name: 'Big Spender',
    description: 'Buy 50 units across all runs.',
    icon: 'Icon1',
    hidden: false,
    category: 'shop',
    evaluate(stats, _event) {
      return stats.lifetime.unitsBought >= 50;
    },
  },
  {
    id: 'roll_the_dice',
    name: 'Roll the Dice',
    description: 'Reroll the shop 50 times across all runs.',
    icon: 'Icon1',
    hidden: false,
    category: 'shop',
    evaluate(stats, _event) {
      return stats.lifetime.rerolls >= 50;
    },
  },
  {
    id: 'two_stars',
    name: 'Rising Star',
    description: 'Combine your first 2-star unit.',
    icon: 'Icon1',
    hidden: false,
    category: 'shop',
    evaluate(stats, _event) {
      return stats.lifetime.combinesTo2Star >= 1;
    },
  },
  {
    id: 'three_stars',
    name: 'All-Star',
    description: 'Combine your first 3-star unit.',
    icon: 'Icon1',
    hidden: false,
    category: 'shop',
    evaluate(stats, _event) {
      return stats.lifetime.combinesTo3Star >= 1;
    },
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Win a battle without taking any damage.',
    icon: 'Icon1',
    hidden: true,
    category: 'battle',
    evaluate(_stats, event) {
      const rawLog = event.result?.rawLog;
      if (!Array.isArray(rawLog) || rawLog.length === 0) return false;
      if (event.result?.winner !== 'player') return false;
      const end = rawLog.find(e => e.kind === 'battle_end');
      if (!end || !Array.isArray(end.playerSurvivors)) return false;
      return (
        end.playerSurvivors.length === event._initialPlayerSize &&
        end.playerSurvivors.every(u => u.alive && u.hp === u.maxHp)
      );
    },
  },
  {
    id: 'underdog',
    name: 'Underdog',
    description: 'Win a battle while outnumbered.',
    icon: 'Icon1',
    hidden: true,
    category: 'battle',
    evaluate(_stats, event) {
      const rawLog = event.result?.rawLog;
      if (!Array.isArray(rawLog) || rawLog.length === 0) return false;
      if (event.result?.winner !== 'player') return false;
      return event._initialPlayerSize < event._initialEnemySize;
    },
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Play 50 battles across all runs.',
    icon: 'Icon1',
    hidden: false,
    category: 'battle',
    evaluate(stats, _event) {
      return stats.lifetime.battlesPlayed >= 50;
    },
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Complete 10 runs (win or lose).',
    icon: 'Icon1',
    hidden: false,
    category: 'run',
    evaluate(stats, _event) {
      return stats.lifetime.runsCompleted >= 10;
    },
  },
  {
    id: 'tribalist',
    name: 'Tribalist',
    description: 'Win a battle with 3+ units sharing a faction tag.',
    icon: 'Icon1',
    hidden: true,
    category: 'battle',
    evaluate(_stats, event) {
      const rawLog = event.result?.rawLog;
      if (!Array.isArray(rawLog) || rawLog.length === 0) return false;
      if (event.result?.winner !== 'player') return false;
      const team = event.result?.playerTeam ?? [];
      const counts = {};
      for (const u of team) {
        if (u.faction) counts[u.faction] = (counts[u.faction] ?? 0) + 1;
      }
      return Math.max(0, ...Object.values(counts)) >= 3;
    },
  },
]);

// Exported for AchievementManager tests only.
export function _mergeStatesExported(local, cloud) {
  return _mergeStates(local, cloud);
}

function _mergeStates(local, cloud) {
  const merged = {
    version: 1,
    unlocked: {},
    stats: {
      lifetime: { ...local.stats.lifetime },
      run: { ...local.stats.run },
    },
  };

  // unlocked: keep the earlier ISO timestamp (first-wins)
  const allIds = new Set([
    ...Object.keys(local.unlocked ?? {}),
    ...Object.keys(cloud.unlocked ?? {}),
  ]);
  for (const id of allIds) {
    const lt = local.unlocked?.[id];
    const ct = cloud.unlocked?.[id];
    if (lt && ct) {
      merged.unlocked[id] = lt < ct ? lt : ct;
    } else {
      merged.unlocked[id] = lt ?? ct;
    }
  }

  // stats.lifetime: max per numeric key
  const cloudLifetime = cloud.stats ?? {};
  for (const k of Object.keys(merged.stats.lifetime)) {
    const lv = merged.stats.lifetime[k] ?? 0;
    const cv = cloudLifetime[k] ?? 0;
    merged.stats.lifetime[k] = Math.max(lv, cv);
  }

  // Never merge stats.run from cloud
  return merged;
}

export { _mergeStates };
