import { NextResponse } from 'next/server'
import { createConnectSession } from '@/lib/saltedge/service'
import { createClient } from '@/lib/supabase/server'
import { BASE_PATH } from '@/lib/constants'

// Connect start - user clicks "Connect with Salt Edge". Unlike TrueLayer this
// needs the session up front: the widget session is created for the user's
// Salt Edge customer.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin + BASE_PATH
  // Our country codes are TrueLayer-style ('uk'); Salt Edge wants ISO 3166 ('GB').
  const countryParam = requestUrl.searchParams.get('country')
  const country = countryParam ? (countryParam === 'uk' ? 'GB' : countryParam.toUpperCase()) : undefined

  console.log('[saltedge/auth] start', {
    country,
    origin,
    env: process.env.SALTEDGE_ENV || 'sandbox',
    hasAppId: !!process.env.SALTEDGE_APP_ID,
  })

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(`${origin}/connect-bank?error=Supabase not configured`)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=Session expired`)
    }

    const connectUrl = await createConnectSession(supabase, user.id, `${origin}/api/saltedge/callback`, country)

    console.log('[saltedge/auth] redirecting to connect widget', { userId: user.id })

    return NextResponse.redirect(connectUrl)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start Salt Edge connection'
    console.error('Salt Edge connect error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
