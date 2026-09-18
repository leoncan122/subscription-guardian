import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Server-side Supabase client, scoped to the current request's session cookies.
// Use this (never the plain browser client) in Server Components and Route
// Handlers so `auth.getUser()` and RLS-gated queries see the logged-in user.
export async function createClient(): Promise<SupabaseClient | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component - middleware refreshes the session instead.
        }
      },
    },
  })
}
