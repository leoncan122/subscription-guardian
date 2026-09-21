import { NextResponse } from 'next/server'
import * as GC from '@/lib/gocardless/client'
import { GOCARDLESS_COUNTRY_ISO } from '@/lib/constants'

// Lists banks the user can pick from for a country, so /connect-bank can
// show a picker before starting the requisition (GoCardless, unlike
// TrueLayer, needs the institution chosen up front - there's no hosted
// bank-search page to defer that to).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country') || 'uk'
  const isoCountry = GOCARDLESS_COUNTRY_ISO[country] || 'GB'

  try {
    const institutions = await GC.getInstitutions(isoCountry)
    return NextResponse.json({ institutions })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch institutions'
    console.error('GoCardless institutions error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
