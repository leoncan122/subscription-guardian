import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient | null {
  if (_client) return _client
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anonKey) {
    console.error('[Supabase] Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return null
  }
  
  if (!url.startsWith('https://')) {
    console.error('[Supabase] Invalid URL format:', url)
    return null
  }
  
  try {
    _client = createBrowserClient(url, anonKey)
    console.log('[Supabase] Client initialized successfully')
    return _client
  } catch (err) {
    console.error('[Supabase] Failed to create client:', err)
    return null
  }
}
