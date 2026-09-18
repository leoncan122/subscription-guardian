import { NextResponse } from 'next/server'
import * as TL from '@/lib/truelayer/client'
import { detectSubscriptions } from '@/lib/truelayer/service'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/request-ip'

export async function POST(request: Request) {
  try {
    const { connectionId } = await request.json()
    const ctx: TL.TLRequestContext = { correlationId: crypto.randomUUID(), psuIp: getClientIp(request) }

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId required' }, { status: 400 })
    }

    // Get user from session
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Detect subscriptions from bank transactions
    const detected = await detectSubscriptions(supabase, user.id, connectionId, ctx)

    return NextResponse.json({
      success: true,
      subscriptions: detected,
      count: detected.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Detection failed'
    console.error('TrueLayer detect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
