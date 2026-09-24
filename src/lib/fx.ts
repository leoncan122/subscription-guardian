'use client'

import { useEffect, useState } from 'react'
import { BASE_PATH } from '@/lib/constants'
import { Subscription } from '@/types/subscription'
import { convertToMonthly } from '@/utils/helpers'

// `rates[X]` = how many X one unit of `base` buys (ECB reference rates).
export interface FxRates {
  base: string
  date: string
  rates: Record<string, number>
}

export async function getFxRates(base: string): Promise<FxRates | null> {
  try {
    const res = await fetch(`${BASE_PATH}/api/fx?base=${encodeURIComponent(base)}`)
    if (!res.ok) {
      console.error('Failed to load exchange rates:', res.status, await res.text())
      return null
    }
    return await res.json()
  } catch (error) {
    console.error('Failed to load exchange rates:', error)
    return null
  }
}

// Returns null when `from` can't be converted (rates not loaded, or a
// currency the ECB doesn't publish).
export function convertAmount(amount: number, from: string, fx: FxRates | null): number | null {
  const currency = from.toUpperCase()
  if (fx && currency === fx.base) return amount
  const rate = fx?.rates[currency]
  return rate ? amount / rate : null
}

export interface BaseCurrencyTotal {
  monthly: number
  // true when at least one amount went through an exchange rate
  converted: boolean
  // currencies that couldn't be converted and were left out of the total
  excluded: string[]
}

export function monthlyTotalInBase(subscriptions: Subscription[], base: string, fx: FxRates | null): BaseCurrencyTotal {
  let monthly = 0
  let converted = false
  const excluded = new Set<string>()

  for (const s of subscriptions) {
    if (!s.active) continue
    const perMonth = convertToMonthly(s.amount, s.billingCycle)
    const currency = s.currency.toUpperCase()

    if (currency === base) {
      monthly += perMonth
      continue
    }

    const inBase = fx?.base === base ? convertAmount(perMonth, currency, fx) : null
    if (inBase === null) {
      excluded.add(currency)
    } else {
      monthly += inBase
      converted = true
    }
  }

  return { monthly, converted, excluded: [...excluded].sort() }
}

// Loads rates for `base` only when some currency actually needs converting.
export function useFxRates(base: string, currencies: string[]): FxRates | null {
  const [fx, setFx] = useState<FxRates | null>(null)
  const needsRates = currencies.some((c) => c.toUpperCase() !== base)

  useEffect(() => {
    if (!needsRates) return
    let cancelled = false
    getFxRates(base).then((rates) => {
      if (!cancelled) setFx(rates)
    })
    return () => { cancelled = true }
  }, [base, needsRates])

  return fx?.base === base ? fx : null
}
