import { supabase, getPlayerId } from '../supabase.js'
import { BattleEngine } from './BattleEngine.js'

async function snapshotTeam(runId, wins, losses, stage, roster) {
  const playerId = getPlayerId()
  if (!playerId) return
  try {
    await supabase.from('ghost_snapshots').insert({
      player_id: playerId,
      run_id: runId,
      wins,
      losses,
      stage,
      roster,
      team_size: roster.length,
    })
  } catch (_) {}
}

async function fetchOpponent(wins, losses, stage) {
  const playerId = getPlayerId()
  if (!playerId) {
    return new BattleEngine().generateEnemyTeam(stage)
  }
  try {
    const { data, error } = await supabase
      .from('ghost_snapshots')
      .select('roster')
      .eq('wins', wins)
      .eq('losses', losses)
      .neq('player_id', playerId)
      .limit(20)
    if (!error && data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)]
      return pick.roster
    }
  } catch (_) {}
  return new BattleEngine().generateEnemyTeam(stage)
}

async function submitChampion(runId, roster, wins, losses) {
  const playerId = getPlayerId()
  if (!playerId) return
  try {
    await supabase.from('hall_of_fame').insert({
      player_id: playerId,
      run_id: runId,
      roster,
      wins,
      losses,
    })
  } catch (_) {}
}

async function fetchLeaderboard() {
  try {
    const { data, error } = await supabase
      .from('hall_of_fame')
      .select('wins, losses, created_at')
      .order('losses', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(50)
    if (!error && data) return data
  } catch (_) {}
  return []
}

export const GhostManager = { snapshotTeam, fetchOpponent, submitChampion, fetchLeaderboard }
