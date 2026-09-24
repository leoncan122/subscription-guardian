import { NextResponse } from 'next/server'
import * as TL from '@/lib/truelayer/client'
import { BASE_PATH } from '@/lib/constants'

// OAuth Start - User clicks "Connect with TrueLayer"
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin + BASE_PATH
  const country = requestUrl.searchParams.get('country') || undefined

  console.log('[truelayer/auth] start', {
    country,
    origin,
    env: process.env.TRUELAYER_ENV || 'sandbox',
    hasClientId: !!process.env.TRUELAYER_CLIENT_ID,
  })

  try {
    // Must match a redirect URI registered in the TrueLayer console exactly
    const callbackUrl = `${origin}/callback`
    const authUrl = TL.buildAuthorizeUrl(
      callbackUrl,
      process.env.TRUELAYER_CLIENT_ID || '',
      // offline_access is what makes TrueLayer return a refresh token -
      // without it the ~1h access token can't be renewed and every later
      // sync/detection fails until the user reconnects.
      'info accounts balance transactions offline_access',
      country
    )

    console.log('[truelayer/auth] redirecting to authorize url', { authUrl, callbackUrl })

    return NextResponse.redirect(authUrl)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initiate TrueLayer auth'
    console.error('TrueLayer consent error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
