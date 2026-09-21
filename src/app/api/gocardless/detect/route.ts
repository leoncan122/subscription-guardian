import { NextResponse } from 'next/server'
import { detectSubscriptions } from '@/lib/gocardless/service'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { connectionId } = await request.json()

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

    const detected = await detectSubscriptions(supabase, user.id, connectionId)

    return NextResponse.json({
      success: true,
      subscriptions: detected,
      count: detected.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Detection failed'
    console.error('GoCardless detect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
