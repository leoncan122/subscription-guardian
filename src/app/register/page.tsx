'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Register() {
  const router = useRouter()
  const { user, loading: authLoading, configured, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    if (authLoading) return
    if (user) {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      await signUp(email, password)
      // If email confirmation is required, show message
      setError('Registration successful! Check your email for confirmation.')
    } catch (err: any) {
      if (err.message?.includes('already')) {
        setError('An account with this email already exists')
      } else {
        setError(err.message || 'Failed to register')
      }
    } finally {
      setLoading(false)
    }
  }

  // Show loading while auth context is initializing
  if (authLoading || !configured) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading authentication...</p>
          <p className="text-xs text-gray-600 mt-2">Please wait, do not close this page</p>
        </div>
      </div>
    )
  }

  // Show error if Supabase is not configured
  if (!configured) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl mb-4 block">⚠️</span>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Error</h2>
          <p className="text-gray-400 mb-4">Supabase configuration is not available.</p>
          <p className="text-sm text-gray-600">Please check your environment variables or try again later.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🛡️</span>
          <h1 className="text-3xl font-bold text-white mb-2">Subscription Guardian</h1>
          <p className="text-gray-400">Create an account to get started</p>
        </div>

        {/* Register form */}
        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
              loading
                ? 'bg-blue-800 text-blue-200 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="px-4 text-xs text-gray-500">OR</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* GitHub register */}
        <button
          onClick={() => { setError('GitHub OAuth requires Supabase configuration'); setLoading(true); }}
          disabled
          className="w-full py-3 rounded-lg font-medium text-sm bg-gray-900 border border-gray-800 hover:border-gray-700 text-white transition-colors flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>

        {/* Login link */}
        <p className="text-center mt-6 text-sm text-gray-400">
          Already have an account?{' '}
          <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}
