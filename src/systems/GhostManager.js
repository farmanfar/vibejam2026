import { supabase, getPlayerId } from '../supabase.js'
import { BattleEngine } from './BattleEngine.js'

async function snapshotTeam(runId, wins, losses, stage, roster) {
  const playerId = getPlayerId()
  if (!playerId || !supabase) {
    console.warn('[Ghost] Snapshot skipped — no auth or no supabase')
    return
  }
  try {
    console.log(`[Ghost] Snapshotting team (${roster.length} units) at ${wins}W-${losses}L stage ${stage}`)
    const { error } = await supabase.from('ghost_snapshots').insert({
      player_id: playerId,
      run_id: runId,
      wins,
      losses,
      stage,
      roster,
      team_size: roster.length,
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
      .select('roster')
      .eq('wins', wins)
      .eq('losses', losses)
      .neq('player_id', playerId)
      .limit(20)
    if (error) {
      console.error('[Ghost] Fetch error:', error.message)
    } else if (data && data.length > 0) {
      console.log(`[Ghost] Found ${data.length} ghost(s) — picking one`)
      const pick = data[Math.floor(Math.random() * data.length)]
      return pick.roster
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

async function fetchLeaderboard() {
  if (!supabase) {
    console.warn('[Ghost] Leaderboard skipped — no supabase')
    return []
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
      return []
    }
    console.log(`[Ghost] Leaderboard: ${data.length} entries`)
    return data
  } catch (e) {
    console.error('[Ghost] Leaderboard exception:', e)
    return []
  }
}

export const GhostManager = { snapshotTeam, fetchOpponent, submitChampion, fetchLeaderboard }
