import type { Subscription, BillingCycle } from '@/types/subscription'

// How much cancelling a subscription today would save over the next 365
// days, counted from its real renewal dates - not a flat monthly/12
// average, so an off-cycle subscription (e.g. renews in 3 days) still
// counts that charge, and one that just renewed doesn't double-count it.
export function projectedYearlySaving(subscription: Subscription, today: Date = new Date()): number {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const horizon = new Date(start)
  horizon.setDate(horizon.getDate() + 365)

  let next = new Date(subscription.renewalDate)
  let cycles = 0

  for (let i = 0; i < 1000 && next <= horizon; i++) {
    if (next >= start) cycles++
    next = addBillingCycle(next, subscription.billingCycle)
  }

  return cycles * subscription.amount
}

function addBillingCycle(date: Date, cycle: BillingCycle): Date {
  const next = new Date(date)
  switch (cycle) {
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
  }
  return next
}

export interface ChargesTotal {
  total: number
  currency: string
  // currencies left out of the total (a real currency change is rare, but
  // charges must never be summed across currencies without converting)
  excludedCurrencies: string[]
}

// Sums charges in the currency of the most recent one.
export function chargesTotal(charges: { amount: number; currency: string; chargedOn: string }[]): ChargesTotal | null {
  if (charges.length === 0) return null

  const mostRecent = [...charges].sort((a, b) => b.chargedOn.localeCompare(a.chargedOn))[0]
  const currency = mostRecent.currency
  const total = charges.filter((c) => c.currency === currency).reduce((sum, c) => sum + c.amount, 0)
  const excludedCurrencies = [...new Set(charges.filter((c) => c.currency !== currency).map((c) => c.currency))]

  return { total, currency, excludedCurrencies }
}
