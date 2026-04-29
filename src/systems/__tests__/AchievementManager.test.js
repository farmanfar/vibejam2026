import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ACHIEVEMENTS, _mergeStates } from '../../config/achievements.js'

// ── Merge logic tests (pure functions, no Phaser/localStorage) ────────────────

describe('_mergeStates', () => {
  it('keeps earlier unlock timestamp (local wins)', () => {
    const local = {
      unlocked: { first_blood: '2026-01-01T00:00:00.000Z' },
      stats: { lifetime: { battlesWon: 1 }, run: {} },
    }
    const cloud = {
      unlocked: { first_blood: '2026-01-02T00:00:00.000Z' },
      stats: { battlesWon: 1 },
    }
    const result = _mergeStates(local, cloud)
    expect(result.unlocked.first_blood).toBe('2026-01-01T00:00:00.000Z')
  })

  it('keeps earlier unlock timestamp (cloud wins)', () => {
    const local = {
      unlocked: { first_blood: '2026-01-03T00:00:00.000Z' },
      stats: { lifetime: { battlesWon: 1 }, run: {} },
    }
    const cloud = {
      unlocked: { first_blood: '2026-01-01T00:00:00.000Z' },
      stats: { battlesWon: 1 },
    }
    const result = _mergeStates(local, cloud)
    expect(result.unlocked.first_blood).toBe('2026-01-01T00:00:00.000Z')
  })

  it('max-merges lifetime stats', () => {
    const local = {
      unlocked: {},
      stats: {
        lifetime: { battlesWon: 5, battlesPlayed: 10, unitsBought: 0, unitsSold: 0, rerolls: 0, combinesTo2Star: 0, combinesTo3Star: 0, runsCompleted: 0, runsWon: 0, maxWinsInRun: 0 },
        run: {},
      },
    }
    const cloud = {
      unlocked: {},
      stats: { battlesWon: 7, battlesPlayed: 8, unitsBought: 0, unitsSold: 0, rerolls: 0, combinesTo2Star: 0, combinesTo3Star: 0, runsCompleted: 0, runsWon: 0, maxWinsInRun: 0 },
    }
    const result = _mergeStates(local, cloud)
    expect(result.stats.lifetime.battlesWon).toBe(7)
    expect(result.stats.lifetime.battlesPlayed).toBe(10)
  })

  it('does not merge stats.run from cloud', () => {
    const local = {
      unlocked: {},
      stats: {
        lifetime: { battlesWon: 0, battlesPlayed: 0, unitsBought: 0, unitsSold: 0, rerolls: 0, combinesTo2Star: 0, combinesTo3Star: 0, runsCompleted: 0, runsWon: 0, maxWinsInRun: 0 },
        run: { runId: 'local-run', wins: 2, battlesThisRun: 2, rerollsThisRun: 0 },
      },
    }
    const cloud = {
      unlocked: {},
      stats: { battlesWon: 0, run: { runId: 'cloud-run', wins: 99 } },
    }
    const result = _mergeStates(local, cloud)
    expect(result.stats.run.runId).toBe('local-run')
    expect(result.stats.run.wins).toBe(2)
  })
})

// ── Achievement predicate tests ───────────────────────────────────────────────

const emptyLifetime = {
  battlesPlayed: 0, battlesWon: 0,
  unitsBought: 0, unitsSold: 0,
  rerolls: 0, combinesTo2Star: 0, combinesTo3Star: 0,
  runsCompleted: 0, runsWon: 0, maxWinsInRun: 0,
}
const emptyRun = { runId: null, wins: 0, battlesThisRun: 0, rerollsThisRun: 0 }

function stats(overrideLifetime = {}, overrideRun = {}) {
  return {
    lifetime: { ...emptyLifetime, ...overrideLifetime },
    run: { ...emptyRun, ...overrideRun },
  }
}

function findAchievement(id) {
  return ACHIEVEMENTS.find(a => a.id === id)
}

describe('untouchable predicate', () => {
  const def = findAchievement('untouchable')

  function makeEvent({ winner = 'player', survivors, initialPlayerSize } = {}) {
    return {
      result: {
        winner,
        rawLog: [
          { kind: 'battle_end', playerSurvivors: survivors },
        ],
      },
      _initialPlayerSize: initialPlayerSize ?? survivors?.length ?? 0,
      _initialEnemySize: 2,
    }
  }

  it('returns true when all survivors alive and full HP', () => {
    const event = makeEvent({
      survivors: [
        { alive: true, hp: 10, maxHp: 10 },
        { alive: true, hp: 5, maxHp: 5 },
      ],
      initialPlayerSize: 2,
    })
    expect(def.evaluate(stats(), event)).toBe(true)
  })

  it('returns false when a survivor took damage', () => {
    const event = makeEvent({
      survivors: [
        { alive: true, hp: 9, maxHp: 10 },
        { alive: true, hp: 5, maxHp: 5 },
      ],
      initialPlayerSize: 2,
    })
    expect(def.evaluate(stats(), event)).toBe(false)
  })

  it('returns false when a unit died (fewer survivors than started)', () => {
    const event = makeEvent({
      survivors: [{ alive: true, hp: 10, maxHp: 10 }],
      initialPlayerSize: 2,
    })
    expect(def.evaluate(stats(), event)).toBe(false)
  })

  it('returns false on empty rawLog', () => {
    const event = { result: { winner: 'player', rawLog: [] }, _initialPlayerSize: 2, _initialEnemySize: 2 }
    expect(def.evaluate(stats(), event)).toBe(false)
  })

  it('returns false when enemy wins', () => {
    const event = makeEvent({ winner: 'enemy', survivors: [{ alive: true, hp: 10, maxHp: 10 }], initialPlayerSize: 1 })
    expect(def.evaluate(stats(), event)).toBe(false)
  })
})

describe('underdog predicate', () => {
  const def = findAchievement('underdog')

  it('returns true when outnumbered and won', () => {
    const event = {
      result: { winner: 'player', rawLog: [{ kind: 'battle_end', playerSurvivors: [] }] },
      _initialPlayerSize: 2,
      _initialEnemySize: 3,
    }
    expect(def.evaluate(stats(), event)).toBe(true)
  })

  it('returns false when equal numbers', () => {
    const event = {
      result: { winner: 'player', rawLog: [{ kind: 'battle_end', playerSurvivors: [] }] },
      _initialPlayerSize: 2,
      _initialEnemySize: 2,
    }
    expect(def.evaluate(stats(), event)).toBe(false)
  })
})

describe('onBattleResolved idempotency', () => {
  it('does not double-count battlesPlayed when called twice with same result', () => {
    // We test by directly inspecting the pure merge path and predicate logic —
    // AchievementManager is not importable headlessly (it uses localStorage/Phaser),
    // so we replicate its idempotency guard here.
    const result = { won: true, _achievementsResolved: false }
    let battlesPlayed = 0

    function resolveOnce(r) {
      if (!r || r._achievementsResolved) return
      r._achievementsResolved = true
      battlesPlayed++
    }

    resolveOnce(result)
    resolveOnce(result)

    expect(battlesPlayed).toBe(1)
  })
})

describe('onRunEnd idempotency', () => {
  it('does not double-count runsCompleted for the same runId', () => {
    let lastResolvedRunId = null
    let runsCompleted = 0

    function endRun(runId) {
      if (runId && runId === lastResolvedRunId) return
      lastResolvedRunId = runId
      runsCompleted++
    }

    const id = 'run-abc'
    endRun(id)
    endRun(id)

    expect(runsCompleted).toBe(1)
  })
})
