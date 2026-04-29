import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

let _supabase = null
if (supabaseUrl && supabaseAnonKey) {
  _supabase = createClient(supabaseUrl, supabaseAnonKey)
  console.log('[Auth] Supabase client created for', supabaseUrl)
} else {
  console.warn('[Auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running offline')
}
export const supabase = _supabase

let playerId = null

export async function initAuth() {
  if (!supabase) {
    console.warn('[Auth] No supabase client — skipping auth')
    return
  }
  try {
    console.log('[Auth] Attempting anonymous sign-in...')
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('[Auth] Sign-in error:', error.message)
      return
    }
    if (data?.user) {
      playerId = data.user.id
      console.log('[Auth] Signed in as', playerId)
    }
  } catch (e) {
    console.error('[Auth] Sign-in exception:', e)
  }
}

export function getPlayerId() {
  return playerId
}
