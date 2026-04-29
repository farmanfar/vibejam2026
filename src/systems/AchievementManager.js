import { supabase, getPlayerId, supabaseUrl, supabaseAnonKey } from '../supabase.js'
import { ACHIEVEMENTS, _mergeStates } from '../config/achievements.js'

const LS_KEY = 'hired_swords_achievements_v1'

let _state = null
let _pushTimer = null
let _pendingToasts = []
let _lastResolvedRunId = null
let _isTutorialRun = false

function _emptyState() {
  return {
    version: 1,
    unlocked: {},
    stats: {
      lifetime: {
        battlesPlayed: 0, battlesWon: 0,
        unitsBought: 0, unitsSold: 0,
        rerolls: 0, combinesTo2Star: 0, combinesTo3Star: 0,
        runsCompleted: 0, runsWon: 0, maxWinsInRun: 0,
      },
      run: { runId: null, wins: 0, battlesThisRun: 0, rerollsThisRun: 0 },
    },
  }
}

function _saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_state))
  } catch (e) {
    console.error('[Achievement] localStorage write failed:', e)
  }
}

function _pushCloud() {
  clearTimeout(_pushTimer)
  _pushTimer = setTimeout(async () => {
    if (!supabase) return
    const pid = getPlayerId()
    if (!pid || !_state) return
    const { error } = await supabase.from('player_progress').upsert({
      player_id: pid,
      unlocked: _state.unlocked,
      stats: _state.stats.lifetime,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id' })
    if (error) console.error('[Achievement] cloud push failed:', error)
  }, 5000)
}

async function _pullCloud() {
  if (!supabase) return null
  const pid = getPlayerId()
  if (!pid) return null
  try {
    const { data, error } = await supabase
      .from('player_progress')
      .select('unlocked, stats')
      .eq('player_id', pid)
      .maybeSingle()
    if (error) {
      console.error('[Achievement] cloud pull failed:', error)
      return null
    }
    if (!data) return null
    return { unlocked: data.unlocked ?? {}, stats: data.stats ?? {} }
  } catch (e) {
    console.error('[Achievement] cloud pull exception:', e)
    return null
  }
}

function _unlock(id) {
  if (_state.unlocked[id]) return
  const def = ACHIEVEMENTS.find(a => a.id === id)
  if (!def) return
  _state.unlocked[id] = new Date().toISOString()
  _saveLocal()
  _pendingToasts.push({ id: def.id, name: def.name, description: def.description })
  _pushCloud()
  console.log(`[Achievement] unlocked: ${id}`)
}

function _evaluateAll(event) {
  for (const def of ACHIEVEMENTS) {
    if (_state.unlocked[def.id]) continue
    try {
      if (def.evaluate(_state.stats, event)) _unlock(def.id)
    } catch (e) {
      console.error(`[Achievement] evaluate error for ${def.id}:`, e)
    }
  }
}

export const AchievementManager = {

  async init() {
    let local
    try {
      const raw = localStorage.getItem(LS_KEY)
      local = raw ? JSON.parse(raw) : _emptyState()
    } catch (e) {
      console.error('[Achievement] localStorage read failed:', e)
      local = _emptyState()
    }
    const cloud = await _pullCloud()
    _state = cloud ? _mergeStates(local, cloud) : local
    _saveLocal()
    if (cloud) _pushCloud()

    window.addEventListener('beforeunload', () => {
      const pid = getPlayerId()
      if (!pid || !_state || !supabaseUrl || !supabaseAnonKey) return
      fetch(`${supabaseUrl}/rest/v1/player_progress`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          player_id: pid,
          unlocked: _state.unlocked,
          stats: _state.stats.lifetime,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    })

    console.log(`[Achievement] init: ${Object.keys(_state.unlocked).length} unlocked`)
  },

  onRunStart({ runId, mode }) {
    _lastResolvedRunId = null
    _isTutorialRun = mode === 'tutorial'
    if (_isTutorialRun) {
      console.log('[Achievement] Tutorial run — achievements disabled for this run')
      return
    }
    _state.stats.run = { runId, wins: 0, battlesThisRun: 0, rerollsThisRun: 0 }
    _saveLocal()
    _evaluateAll({ type: 'runStart', runId, mode })
  },

  onBattleResolved(battleScene) {
    if (_isTutorialRun) return
    const result = battleScene._battleResult
    if (!result || result._achievementsResolved) return
    result._achievementsResolved = true

    _state.stats.lifetime.battlesPlayed++
    _state.stats.run.battlesThisRun++
    if (result.won) {
      _state.stats.lifetime.battlesWon++
      _state.stats.run.wins++
      if (_state.stats.run.wins > _state.stats.lifetime.maxWinsInRun)
        _state.stats.lifetime.maxWinsInRun = _state.stats.run.wins
    }
    _saveLocal()
    _evaluateAll({
      type: 'battle',
      result,
      won: result.won,
      _initialPlayerSize: battleScene._initialPlayerSize,
      _initialEnemySize: battleScene._initialEnemySize,
    })
  },

  onShopBuy({ unit, starLevel }) {
    if (_isTutorialRun) return
    _state.stats.lifetime.unitsBought++
    _saveLocal()
    _evaluateAll({ type: 'shopBuy', unit, starLevel })
  },

  onShopSell({ unit }) {
    if (_isTutorialRun) return
    _state.stats.lifetime.unitsSold++
    _saveLocal()
    _evaluateAll({ type: 'shopSell', unit })
  },

  onShopReroll() {
    if (_isTutorialRun) return
    _state.stats.lifetime.rerolls++
    _state.stats.run.rerollsThisRun++
    _saveLocal()
    _evaluateAll({ type: 'shopReroll' })
  },

  onShopCombine({ newStars }) {
    if (_isTutorialRun) return
    if (newStars === 2) _state.stats.lifetime.combinesTo2Star++
    if (newStars === 3) _state.stats.lifetime.combinesTo3Star++
    _saveLocal()
    _evaluateAll({ type: 'shopCombine', newStars })
  },

  onChampion({ scene, roster }) {
    if (_isTutorialRun) return
    const runId = scene.runId
    if (runId && runId === _lastResolvedRunId) return
    _lastResolvedRunId = runId
    _state.stats.lifetime.runsWon++
    _state.stats.run.wins = 9
    _saveLocal()
    _evaluateAll({ type: 'champion', won: true, roster })
    AchievementManager.onRunEnd({ scene, won: true, _fromChampion: true })
  },

  onRunEnd({ scene, won, _fromChampion = false }) {
    if (_isTutorialRun) return
    if (_fromChampion) {
      // stats already written by onChampion — just count the run
    } else {
      const runId = scene.runId ?? _state.stats.run.runId
      if (runId && runId === _lastResolvedRunId) return
      _lastResolvedRunId = runId
    }
    _state.stats.lifetime.runsCompleted++
    _saveLocal()
    _evaluateAll({ type: 'runEnd', won })
  },

  getAll()         { return ACHIEVEMENTS },
  getUnlocked()    { return { ..._state?.unlocked } },
  getUnlockedIds() { return Object.keys(_state?.unlocked ?? {}) },
  getStats()       { return _state?.stats },
  pendingToasts()  {
    const q = [..._pendingToasts]
    _pendingToasts = []
    return q
  },
}
