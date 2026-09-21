import { NextResponse } from 'next/server'
import { getConnectionByReference, linkAndSyncAccounts, detectSubscriptions } from '@/lib/gocardless/service'
import { createClient } from '@/lib/supabase/server'
import { BASE_PATH } from '@/lib/constants'

// GoCardless redirects here once the user finishes authenticating with their
// bank on GoCardless's hosted page. Unlike TrueLayer there's no code to
// exchange - the requisition itself carries the linked account ids once its
// status flips to 'LN'. `ref` is the value we generated and passed as the
// requisition's `redirect` query string in src/app/api/auth/gocardless/route.ts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('ref')
  const origin = new URL(request.url).origin + BASE_PATH

  if (!reference) {
    return NextResponse.redirect(`${origin}/connect-bank?error=Missing reference`)
  }

  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(`${origin}/connect-bank?error=Supabase not configured`)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=Session expired`)
    }

    const conn = await getConnectionByReference(supabase, user.id, reference)
    if (!conn) {
      return NextResponse.redirect(`${origin}/connect-bank?error=Connection not found`)
    }

    await linkAndSyncAccounts(supabase, user.id, conn.id)

    try {
      await detectSubscriptions(supabase, user.id, conn.id)
    } catch (e) {
      console.warn('Subscription detection failed during GoCardless callback:', e)
    }

    return NextResponse.redirect(`${origin}/dashboard?success=true&message=Bank connected successfully`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to link bank'
    console.error('GoCardless callback error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
