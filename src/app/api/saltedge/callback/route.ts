import { NextResponse } from 'next/server'
import { saveConnection, syncAccounts, detectSubscriptions } from '@/lib/saltedge/service'
import { createClient } from '@/lib/supabase/server'
import { BASE_PATH } from '@/lib/constants'

// Salt Edge Connect widget return_to - the user lands here once they've
// finished (or abandoned) connecting their bank, with ?connection_id=...
// on success or ?error_class=... on failure.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connection_id')
  const errorClass = searchParams.get('error_class')
  const origin = new URL(request.url).origin + BASE_PATH
  const correlationId = crypto.randomUUID()

  console.log('[saltedge/callback] incoming', { correlationId, connectionId, errorClass })

  if (errorClass) {
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(`Salt Edge: ${errorClass}`)}`)
  }

  if (!connectionId) {
    return NextResponse.redirect(`${origin}/connect-bank?error=Missing connection id`)
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

    // 1. Save the connection (checks it belongs to this user)
    const connection = await saveConnection(supabase, user.id, connectionId)
    console.log('[saltedge/callback] connection saved', { correlationId, connectionId: connection.id, status: connection.status })

    if (connection.status !== 'active') {
      return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent('Salt Edge connection is not active')}`)
    }

    // 2. Fetch and sync accounts
    try {
      await syncAccounts(supabase, user.id, connection.id)
    } catch (e) {
      console.warn(`Salt Edge account sync failed during callback [${correlationId}]:`, e)
    }

    // 3. Detect subscriptions from transactions
    try {
      await detectSubscriptions(supabase, user.id, connection.id, correlationId)
    } catch (e) {
      console.warn(`Salt Edge subscription detection failed during callback [${correlationId}]:`, e)
    }

    return NextResponse.redirect(`${origin}/dashboard?success=true&message=Bank connected successfully`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save Salt Edge connection'
    console.error(`[saltedge/callback] failed [${correlationId}]:`, error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
