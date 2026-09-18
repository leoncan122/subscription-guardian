import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, Session, User } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Browser client - persists the session in cookies (not localStorage) so
// server components and route handlers can read the same session.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : null

export type { Session, User }
