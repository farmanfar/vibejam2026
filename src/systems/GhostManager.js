import { supabase, getPlayerId } from '../supabase.js'
import { BattleEngine } from './BattleEngine.js'
import { getAlphaUnitById } from '../config/alpha-units.js'
import { PlayerConfig } from './PlayerConfig.js'

function filterToAlphaRoster(roster) {
  if (!Array.isArray(roster)) return []
  const kept = []
  for (const entry of roster) {
    if (!entry || !entry.id) continue
    const alpha = getAlphaUnitById(entry.id)
    if (!alpha) {
      console.warn(`[Ghost] Dropping legacy-id ghost ${entry.id} — no alpha unit match`)
      continue
    }
    if (alpha.enabled === false) {
      console.warn(`[Ghost] Dropping blocked-art ghost ${entry.id} — art_status blocked, not playable`)
      continue
    }
    // Merge legacy hp/atk overrides onto the alpha base.
    kept.push({
      ...alpha,
      hp: entry.hp ?? alpha.hp,
      atk: entry.atk ?? alpha.atk,
    })
  }
  return kept
}

async function snapshotTeam(runId, wins, losses, stage, roster) {
  const playerId = getPlayerId()
  if (!playerId || !supabase) {
    console.warn('[Ghost] Snapshot skipped — no auth or no supabase')
    return
  }
  try {
    const nickname = (PlayerConfig.getName() || '').trim() || 'ANON'
    console.log(`[Ghost] Snapshotting team (${roster.length} units) at ${wins}W-${losses}L stage ${stage} as "${nickname}"`)
    const { error } = await supabase.from('ghost_snapshots').insert({
      player_id: playerId,
      run_id: runId,
      wins,
      losses,
      stage,
      roster,
      team_size: roster.length,
      nickname,
    })
    if (error) {
      console.error('[Ghost] Snapshot insert error:', error.message)
    } else {
      console.log('[Ghost] Snapshot stored successfully')
    }
  } catch (e) {
    console.error('[Ghost] Snapshot exception:', e)
  }
}

async function fetchOpponent(wins, losses, stage) {
  const playerId = getPlayerId()
  if (!playerId || !supabase) {
    console.warn('[Ghost] No auth or no supabase — generating synthetic opponent')
    return new BattleEngine().generateEnemyTeam(stage)
  }
  try {
    console.log(`[Ghost] Searching for ghost at ${wins}W-${losses}L (excluding ${playerId.slice(0, 8)}...)`)
    const { data, error } = await supabase
      .from('ghost_snapshots')
      .select('roster, nickname')
      .eq('wins', wins)
      .eq('losses', losses)
      .neq('player_id', playerId)
      .limit(20)
    if (error) {
      console.error('[Ghost] Fetch error:', error.message)
    } else if (data && data.length > 0) {
      console.log(`[Ghost] Found ${data.length} ghost(s) — picking one`)
      const pick = data[Math.floor(Math.random() * data.length)]
      const filtered = filterToAlphaRoster(pick.roster)
      if (filtered.length === 0) {
        console.warn('[Ghost] Ghost roster had no alpha-compatible units — falling through to synthetic')
      } else {
        // Attach nickname as a property on the array — BattleScene already
        // uses this same pattern to bolt `commander` onto the opponent.
        filtered.nickname = (pick.nickname || '').trim() || 'ANON'
        console.log(`[Ghost] Selected ghost: "${filtered.nickname}" (${filtered.length} units)`)
        return filtered
      }
    } else {
      console.log('[Ghost] No ghosts found at this W/L — generating synthetic')
    }
  } catch (e) {
    console.error('[Ghost] Fetch exception:', e)
  }
  return new BattleEngine().generateEnemyTeam(stage)
}

async function submitChampion(runId, roster, wins, losses) {
  const playerId = getPlayerId()
  if (!playerId || !supabase) {
    console.warn('[Ghost] Champion submit skipped — no auth or no supabase')
    return
  }
  try {
    console.log(`[Ghost] Submitting champion: ${wins}W-${losses}L`)
    const { error } = await supabase.from('hall_of_fame').insert({
      player_id: playerId,
      run_id: runId,
      roster,
      wins,
      losses,
    })
    if (error) {
      console.error('[Ghost] Champion insert error:', error.message)
    } else {
      console.log('[Ghost] Champion stored in hall of fame')
    }
  } catch (e) {
    console.error('[Ghost] Champion exception:', e)
  }
}

/**
 * Fetch the top-10 ghost teams for the Battle Archive.
 * Queries ghost_snapshots, dedupes by run_id (best snapshot per run), returns top 10 by wins desc.
 * @returns {Promise<object[]|null>} Array of up to 10 entries, or null on error/offline.
 */
async function fetchTopGhosts() {
  if (!supabase) {
    console.warn('[Ghost] Archive fetch skipped — no supabase')
    return null
  }
  try {
    console.log('[Ghost] Fetching archive (top ghosts)...')
    const { data, error } = await supabase
      .from('ghost_snapshots')
      .select('wins, losses, nickname, run_id, created_at')
      .order('wins', { ascending: false })
      .order('losses', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      console.error('[Ghost] Archive fetch error:', error.message)
      return null
    }
    // Dedupe by run_id — keep only the highest-wins snapshot per run.
    // Since results are already sorted wins desc, first occurrence of each run_id is the best.
    const seen = new Set()
    const deduped = []
    for (const row of data) {
      if (!seen.has(row.run_id)) {
        seen.add(row.run_id)
        deduped.push(row)
      }
      if (deduped.length === 10) break
    }
    console.log(`[Ghost] Archive: ${deduped.length} entries (from ${data.length} raw rows)`)
    return deduped
  } catch (e) {
    console.error('[Ghost] Archive exception:', e)
    return null
  }
}

/**
 * Fetch the leaderboard.
 * @returns {Promise<object[]|null>} Array of entries on success (may be empty), null on error/offline.
 */
async function fetchLeaderboard() {
  if (!supabase) {
    console.warn('[Ghost] Leaderboard skipped — no supabase')
    return null
  }
  try {
    console.log('[Ghost] Fetching leaderboard...')
    const { data, error } = await supabase
      .from('hall_of_fame')
      .select('wins, losses, created_at')
      .order('losses', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(50)
    if (error) {
      console.error('[Ghost] Leaderboard error:', error.message)
      return null
    }
    console.log(`[Ghost] Leaderboard: ${data.length} entries`)
    return data
  } catch (e) {
    console.error('[Ghost] Leaderboard exception:', e)
    return null
  }
}

export const GhostManager = { snapshotTeam, fetchOpponent, submitChampion, fetchLeaderboard, fetchTopGhosts }
