import { NextResponse } from 'next/server'
import { CURRENCIES } from '@/lib/locale'

// Daily reference exchange rates from the European Central Bank, via
// Frankfurter (free, no API key): https://frankfurter.dev
// ECB publishes once per working day, so the upstream fetch is cached for 12h.
const FX_SOURCE = 'https://api.frankfurter.dev/v1/latest'

export async function GET(request: Request) {
  const base = new URL(request.url).searchParams.get('base')?.toUpperCase() || 'EUR'

  if (!(CURRENCIES as readonly string[]).includes(base)) {
    return NextResponse.json({ error: `Unsupported base currency: ${base}` }, { status: 400 })
  }

  try {
    const res = await fetch(`${FX_SOURCE}?base=${base}`, { next: { revalidate: 43200 } })
    if (!res.ok) {
      const body = await res.text()
      console.error('[fx] upstream error', res.status, body)
      return NextResponse.json({ error: 'Exchange rates unavailable' }, { status: 502 })
    }

    const data: { base: string; date: string; rates: Record<string, number> } = await res.json()

    return NextResponse.json(
      { base: data.base, date: data.date, rates: { ...data.rates, [data.base]: 1 } },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    )
  } catch (error) {
    console.error('[fx] fetch failed:', error)
    return NextResponse.json({ error: 'Exchange rates unavailable' }, { status: 502 })
  }
}
