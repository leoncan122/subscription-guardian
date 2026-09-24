import { supabase } from '@/lib/supabase/client'
import { detectLocaleDefaults } from '@/lib/locale'

// Per-user view configuration, stored in `user_settings` (see
// supabase/migrations/006_user_settings_profile.sql). `currency` is the base
// currency totals are shown in; each subscription keeps its own currency.
export interface UserSettings {
  country: string
  locale: string
  currency: string
  timezone: string
  payday: number | null
  notificationsEnabled: boolean
  onboardedAt: string | null
}

const COLUMNS = 'country, locale, currency, timezone, payday, notifications_enabled, onboarded_at'

// Loads the user's settings, creating the row from browser-detected defaults
// the first time. Rows created before migration 006 (or by 001's defaults)
// get their missing fields filled in the same way.
export async function getOrCreateUserSettings(): Promise<UserSettings | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_settings')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error

  const detected = detectLocaleDefaults()

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from('user_settings')
      .insert({
        user_id: user.id,
        country: detected.country,
        locale: detected.locale,
        currency: detected.currency,
        timezone: detected.timezone,
      })
      .select(COLUMNS)
      .single()

    if (insertError) throw insertError
    return normalizeSettings(created)
  }

  const missing: Record<string, string> = {}
  if (!data.country) missing.country = detected.country
  if (!data.locale) missing.locale = detected.locale
  if (!data.timezone) missing.timezone = detected.timezone
  // A legacy row with no country still has 001's 'USD' default, which was
  // never chosen by the user - replace it along with the rest.
  if (!data.country) missing.currency = detected.currency

  if (Object.keys(missing).length === 0) return normalizeSettings(data)

  const { data: patched, error: updateError } = await supabase
    .from('user_settings')
    .update(missing)
    .eq('user_id', user.id)
    .select(COLUMNS)
    .single()

  if (updateError) {
    console.error('Failed to backfill user settings:', updateError)
    return normalizeSettings({ ...data, ...missing })
  }
  return normalizeSettings(patched)
}

export async function updateUserSettings(updates: Partial<UserSettings>): Promise<UserSettings | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const row: Record<string, unknown> = {}
  if (updates.country !== undefined) row.country = updates.country
  if (updates.locale !== undefined) row.locale = updates.locale
  if (updates.currency !== undefined) row.currency = updates.currency
  if (updates.timezone !== undefined) row.timezone = updates.timezone
  if (updates.payday !== undefined) row.payday = updates.payday
  if (updates.notificationsEnabled !== undefined) row.notifications_enabled = updates.notificationsEnabled
  if (updates.onboardedAt !== undefined) row.onboarded_at = updates.onboardedAt

  const { data, error } = await supabase
    .from('user_settings')
    .update(row)
    .eq('user_id', user.id)
    .select(COLUMNS)
    .single()

  if (error) throw error
  return normalizeSettings(data)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSettings(row: any): UserSettings {
  return {
    country: row.country,
    locale: row.locale,
    currency: row.currency,
    timezone: row.timezone,
    payday: row.payday ?? null,
    notificationsEnabled: row.notifications_enabled !== false,
    onboardedAt: row.onboarded_at ?? null,
  }
}
