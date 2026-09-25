import { NextResponse } from 'next/server'
import { detectSubscriptions } from '@/lib/saltedge/service'
import { markConnectionExpired, ReconnectRequiredError } from '@/lib/truelayer/service'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { connectionId } = await request.json()
    const correlationId = crypto.randomUUID()

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId required' }, { status: 400 })
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let detected
    try {
      detected = await detectSubscriptions(supabase, user.id, connectionId, correlationId)
    } catch (error) {
      if (!(error instanceof ReconnectRequiredError)) throw error
      // Salt Edge can't read this bank any more - retire the connection and
      // tell the client to send the user through the connect flow again.
      console.warn(`[saltedge/detect ${correlationId}] reconnect required:`, error.message)
      await markConnectionExpired(supabase, user.id, connectionId)
      return NextResponse.json(
        { error: 'Bank access expired - reconnect your bank', code: 'reconnect_required' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      subscriptions: detected,
      count: detected.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Detection failed'
    console.error('Salt Edge detect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
