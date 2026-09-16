'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Session, type User, type SupabaseClient } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGithub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Initialize client synchronously - not in a promise
    const client = createClient()
    
    if (!client) {
      console.error('[Auth] Supabase client not initialized')
      setConfigured(false)
      setLoading(false)
      return
    }

    console.log('[Auth] Supabase client ready')
    setSupabase(client)
    setConfigured(true)

    // Get initial session
    client.auth.getSession().then(({ data: { session } }) => {
      if (mountedRef.current) {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const maxWait = 5000
    const startTime = Date.now()
    while (!supabase && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!supabase) {
      throw new Error('Supabase not configured. Please refresh the page.')
    }
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }, [supabase])

  const signIn = useCallback(async (email: string, password: string) => {
    const maxWait = 5000
    const startTime = Date.now()
    while (!supabase && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!supabase) {
      throw new Error('Supabase not configured. Please refresh the page.')
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [supabase])

  const signInWithGithub = useCallback(async () => {
    const maxWait = 5000
    const startTime = Date.now()
    while (!supabase && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!supabase) {
      throw new Error('Supabase not configured. Please refresh the page.')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }, [supabase])

  const signOut = useCallback(async () => {
    const maxWait = 5000
    const startTime = Date.now()
    while (!supabase && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!supabase) {
      throw new Error('Supabase not configured. Please refresh the page.')
    }
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [supabase])

  return (
    <AuthContext.Provider
      value={{ user, session, loading, configured, signUp, signIn, signInWithGithub, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
