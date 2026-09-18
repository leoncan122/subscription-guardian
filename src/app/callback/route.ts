import { NextResponse } from 'next/server'
import * as TL from '@/lib/truelayer/client'
import { createConnection, syncAccounts, detectSubscriptions } from '@/lib/truelayer/service'
import { createClient } from '@/lib/supabase/server'
import { BASE_PATH } from '@/lib/constants'
import { getClientIp } from '@/lib/request-ip'

// OAuth Callback - TrueLayer redirects here after the user authorizes.
// This path must exactly match the redirect URI registered in the TrueLayer console.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')
  const origin = new URL(request.url).origin + BASE_PATH
  const ctx: TL.TLRequestContext = { correlationId: crypto.randomUUID(), psuIp: getClientIp(request) }

  if (error) {
    const desc = errorDesc || 'TrueLayer authentication failed'
    console.error('TrueLayer OAuth error:', error, desc)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(desc)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/connect-bank?error=Missing authorization code`)
  }

  try {
    // 1. Exchange code for tokens
    const callbackUrl = `${origin}/callback`
    const tokenData = await TL.getToken(
      code,
      callbackUrl,
      process.env.TRUELAYER_CLIENT_ID || '',
      process.env.TRUELAYER_CLIENT_SECRET || ''
    )

    // 2. Get user from session
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(`${origin}/connect-bank?error=Supabase not configured`)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=Session expired`)
    }

    // 3. Identify this connection (TrueLayer has no separate consent id - use credentials_id)
    const me = await TL.getMe(tokenData.access_token, ctx)

    // 4. Save connection to DB
    const connection = await createConnection(
      supabase,
      user.id,
      me.credentials_id,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in
    )

    // 5. Fetch and sync accounts
    try {
      await syncAccounts(supabase, user.id, connection.id, ctx)
    } catch (e) {
      console.warn(`Account sync failed during callback [${ctx.correlationId}]:`, e)
    }

    // 6. Detect subscriptions from transactions
    try {
      await detectSubscriptions(supabase, user.id, connection.id, ctx)
    } catch (e) {
      console.warn(`Subscription detection failed during callback [${ctx.correlationId}]:`, e)
    }

    return NextResponse.redirect(`${origin}/dashboard?success=true&message=Bank connected successfully`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token exchange failed'
    console.error('TrueLayer callback error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
