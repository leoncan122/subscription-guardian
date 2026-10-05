import type { Subscription, BillingCycle } from '@/types/subscription'
import type { SubscriptionCharge } from '@/lib/supabase/subscriptions'
import { convertToMonthly } from '@/utils/helpers'

// Stats behind the history page. Pure functions over already-loaded data:
// no Supabase, no React, so each piece is testable on its own and reusable
// from anywhere (dashboard cards, a future export, the alerts cron).

export interface CanceledSubscription extends Subscription {
  // When the user cancelled it. Null for rows cancelled before migration
  // 014 added the column and whose updated_at backfill found nothing.
  canceledAt: string | null
}

/**
 * Money NOT paid since cancelling: counts the billing cycles that would
 * have been charged between the cancellation date and today.
 *
 * Deliberately conservative - it only counts cycles that have fully
 * elapsed, so the figure is money genuinely not spent, never a projection.
 * Returns 0 when the cancellation date is unknown or in the future.
 */
export function accumulatedSaving(
  subscription: CanceledSubscription,
  today: Date = new Date(),
): number {
  if (!subscription.canceledAt) return 0

  const canceled = new Date(subscription.canceledAt)
  if (Number.isNaN(canceled.getTime())) return 0

  canceled.setHours(0, 0, 0, 0)
  const end = new Date(today)
  end.setHours(0, 0, 0, 0)
  if (canceled >= end) return 0

  // Walk forward one billing cycle at a time from the cancellation date.
  // Each boundary reached is one charge avoided.
  let cycles = 0
  let next = addBillingCycle(canceled, subscription.billingCycle)
  for (let i = 0; i < 1000 && next <= end; i++) {
    cycles++
    next = addBillingCycle(next, subscription.billingCycle)
  }

  return cycles * subscription.amount
}

/** Whole months elapsed between cancellation and today (for the subtitle). */
export function monthsSinceCancellation(
  subscription: CanceledSubscription,
  today: Date = new Date(),
): number | null {
  if (!subscription.canceledAt) return null
  const canceled = new Date(subscription.canceledAt)
  if (Number.isNaN(canceled.getTime())) return null

  let months =
    (today.getFullYear() - canceled.getFullYear()) * 12 + (today.getMonth() - canceled.getMonth())
  if (today.getDate() < canceled.getDate()) months--
  return Math.max(0, months)
}

export interface SavingsTotal {
  /** Total not paid, in the base currency. */
  total: number
  /** True when at least one amount went through an exchange rate. */
  converted: boolean
  /** Currencies left out because they couldn't be converted. */
  excluded: string[]
}

type Converter = (amount: number, currency: string) => number | null

/**
 * Accumulated saving across every cancelled subscription, in base currency.
 *
 * @param convert Returns the amount in base currency, or null if that
 *                currency can't be converted (then it's excluded, never
 *                summed raw - mixing currencies would be a wrong number).
 */
export function totalAccumulatedSaving(
  canceled: CanceledSubscription[],
  base: string,
  convert: Converter,
  today: Date = new Date(),
): SavingsTotal {
  let total = 0
  let converted = false
  const excluded = new Set<string>()

  for (const sub of canceled) {
    const saved = accumulatedSaving(sub, today)
    if (saved === 0) continue

    const currency = sub.currency.toUpperCase()
    if (currency === base.toUpperCase()) {
      total += saved
      continue
    }

    const inBase = convert(saved, currency)
    if (inBase === null) {
      excluded.add(currency)
    } else {
      total += inBase
      converted = true
    }
  }

  return { total, converted, excluded: [...excluded].sort() }
}

export interface MonthlySpend {
  /** Month key, YYYY-MM. */
  month: string
  total: number
  currency: string
  chargeCount: number
}

/**
 * Real charges grouped by calendar month, oldest first.
 *
 * Only sums charges in `currency` (the caller passes the dominant one);
 * charges in other currencies are reported via `excludedCurrencies` rather
 * than being added to a meaningless mixed total.
 */
export function monthlySpend(
  charges: SubscriptionCharge[],
  currency: string,
): { months: MonthlySpend[]; excludedCurrencies: string[] } {
  const target = currency.toUpperCase()
  const buckets = new Map<string, { total: number; chargeCount: number }>()
  const excluded = new Set<string>()

  for (const charge of charges) {
    if (charge.currency.toUpperCase() !== target) {
      excluded.add(charge.currency.toUpperCase())
      continue
    }
    // charged_on is a DATE string (YYYY-MM-DD); slicing avoids timezone
    // shifts that new Date() would introduce near month boundaries.
    const month = charge.chargedOn.slice(0, 7)
    const bucket = buckets.get(month) ?? { total: 0, chargeCount: 0 }
    bucket.total += charge.amount
    bucket.chargeCount++
    buckets.set(month, bucket)
  }

  const months = [...buckets.entries()]
    .map(([month, b]) => ({ month, total: b.total, currency: target, chargeCount: b.chargeCount }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return { months, excludedCurrencies: [...excluded].sort() }
}

/** Dominant currency among charges (most charges wins), or null if none. */
export function dominantCurrency(charges: SubscriptionCharge[]): string | null {
  if (charges.length === 0) return null
  const counts = new Map<string, number>()
  for (const charge of charges) {
    const currency = charge.currency.toUpperCase()
    counts.set(currency, (counts.get(currency) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

export interface HistoryTotals {
  activeCount: number
  canceledCount: number
  /** Total real spend recorded in subscription_charges. */
  lifetimeSpend: number
  lifetimeSpendCurrency: string | null
  /** Charges in currencies left out of lifetimeSpend. */
  spendExcludedCurrencies: string[]
}

export function historyTotals(
  active: Subscription[],
  canceled: CanceledSubscription[],
  charges: SubscriptionCharge[],
): HistoryTotals {
  const currency = dominantCurrency(charges)
  const inCurrency = currency
    ? charges.filter((c) => c.currency.toUpperCase() === currency)
    : []
  const excluded = currency
    ? [...new Set(charges.filter((c) => c.currency.toUpperCase() !== currency).map((c) => c.currency.toUpperCase()))].sort()
    : []

  return {
    activeCount: active.length,
    canceledCount: canceled.length,
    lifetimeSpend: inCurrency.reduce((sum, c) => sum + c.amount, 0),
    lifetimeSpendCurrency: currency,
    spendExcludedCurrencies: excluded,
  }
}

/** Monthly cost of a subscription, for ranking cancelled ones by weight. */
export function monthlyCost(subscription: Subscription): number {
  return convertToMonthly(subscription.amount, subscription.billingCycle)
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
