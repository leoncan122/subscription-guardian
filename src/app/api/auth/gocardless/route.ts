import { NextResponse } from 'next/server'
import * as GC from '@/lib/gocardless/client'
import { createConnection } from '@/lib/gocardless/service'
import { createClient } from '@/lib/supabase/server'
import { BASE_PATH } from '@/lib/constants'

// Requisition Start - user picked an institution on /connect-bank and hits
// this with that institution_id.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin + BASE_PATH
  const institutionId = requestUrl.searchParams.get('institution_id')

  if (!institutionId) {
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent('Missing institution_id')}`)
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

    // Size the agreement's history window to what the bank actually supports
    // instead of GoCardless's 90-day default.
    const institution = await GC.getInstitution(institutionId)
    const maxHistoricalDays = parseInt(institution.transaction_total_days, 10) || 90
    const agreement = await GC.createAgreement(institutionId, maxHistoricalDays)

    // `reference` correlates the redirect back to our pending connection row
    // - GoCardless's own requisition id isn't known to the browser round-trip.
    const reference = crypto.randomUUID()
    const redirect = `${origin}/gocardless-callback?ref=${reference}`
    const requisition = await GC.createRequisition(institutionId, agreement.id, redirect, reference)

    await createConnection(supabase, user.id, requisition.id, agreement.id, institutionId, reference)

    return NextResponse.redirect(requisition.link)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initiate GoCardless auth'
    console.error('GoCardless consent error:', error)
    return NextResponse.redirect(`${origin}/connect-bank?error=${encodeURIComponent(message)}`)
  }
}
