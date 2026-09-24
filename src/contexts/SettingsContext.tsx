'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getOrCreateUserSettings, updateUserSettings, UserSettings } from '@/lib/supabase/settings'
import { detectLocaleDefaults } from '@/lib/locale'

type SettingsContextType = {
  settings: UserSettings
  // true until the signed-in user's stored settings have been loaded
  loading: boolean
  updateSettings: (updates: Partial<UserSettings>) => Promise<boolean>
}

// Server-safe placeholder used for the first render; replaced by
// browser-detected defaults (signed out) or the stored row (signed in).
const FALLBACK_SETTINGS: UserSettings = {
  country: 'GB',
  locale: 'en-GB',
  currency: 'GBP',
  timezone: 'UTC',
  payday: null,
  notificationsEnabled: true,
  onboardedAt: null,
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  // Depend on the id, not the object: token refreshes hand back a new User.
  const userId = user?.id
  const [settings, setSettings] = useState<UserSettings>(FALLBACK_SETTINGS)
  // Which user the current `settings` belong to ('' = signed out); loading
  // is derived from it so a user switch never shows the previous user's data.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = authLoading || loadedFor !== (userId ?? '')

  useEffect(() => {
    if (authLoading) return

    let cancelled = false
    const load = userId ? getOrCreateUserSettings() : Promise.resolve(null)
    load
      .catch((error) => {
        console.error('Failed to load user settings:', error)
        return null
      })
      .then((loaded) => {
        if (cancelled) return
        setSettings(loaded ?? { ...FALLBACK_SETTINGS, ...detectLocaleDefaults() })
        setLoadedFor(userId ?? '')
      })

    return () => { cancelled = true }
  }, [userId, authLoading])

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    try {
      const updated = await updateUserSettings(updates)
      if (!updated) return false
      setSettings(updated)
      return true
    } catch (error) {
      console.error('Failed to update user settings:', error)
      return false
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
