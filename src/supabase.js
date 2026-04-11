import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

let playerId = null

export async function initAuth() {
  try {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (!error && data?.user) {
      playerId = data.user.id
    }
  } catch (_) {}
}

export function getPlayerId() {
  return playerId
}
