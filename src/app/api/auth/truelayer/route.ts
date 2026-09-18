import { NextResponse } from 'next/server'
import * as TL from '@/lib/truelayer/client'
import { BASE_PATH } from '@/lib/constants'

// OAuth Start - User clicks "Connect with TrueLayer"
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin + BASE_PATH
  const country = requestUrl.searchParams.get('country') || undefined

  try {
    // Must match a redirect URI registered in the TrueLayer console exactly
    const callbackUrl = `${origin}/callback`
    const authUrl = TL.buildAuthorizeUrl(
      callbackUrl,
      process.env.TRUELAYER_CLIENT_ID || '',
      'info accounts balance transactions',
      country
    )

    return NextResponse.redirect(authUrl)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initiate TrueLayer auth'
    console.error('TrueLayer consent error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
