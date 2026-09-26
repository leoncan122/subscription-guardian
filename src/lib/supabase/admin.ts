import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Bypasses RLS entirely - only for trusted server-only code that has no
// single logged-in user to scope a request to, such as the daily
// price-change cron (src/app/api/cron/price-change-alerts/route.ts), which
// notifies every user in one run. Never reachable from a request that
// isn't already verified server-side (e.g. the cron's CRON_SECRET check) -
// there's no user session backing this client for RLS to fall back on.
export function createAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
