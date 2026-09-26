import type { BillingCycle } from '@/types/subscription'

const CYCLE_DAYS: Record<BillingCycle, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }

// subscriptions.renewal_date is otherwise never touched once set (not even
// when a bank re-detection confirms a fresh charge) - left alone, a date
// that passes stays in the past forever, so the 1/3-day-before reminder in
// src/app/api/cron/daily-alerts would only ever fire once, for whatever
// date happened to be stored. Called once a day for every active
// subscription before computing days-until, so it always reflects the
// upcoming cycle.
export function advancePastRenewalDate(renewalDate: string, cycle: BillingCycle, today = new Date()): string {
  const cycleDays = CYCLE_DAYS[cycle] ?? CYCLE_DAYS.monthly

  const date = new Date(renewalDate)
  date.setHours(0, 0, 0, 0)
  const todayMidnight = new Date(today)
  todayMidnight.setHours(0, 0, 0, 0)

  while (date.getTime() < todayMidnight.getTime()) {
    date.setDate(date.getDate() + cycleDays)
  }
  return date.toISOString().split('T')[0]
}
