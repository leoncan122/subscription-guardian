import type { SupabaseClient } from '@supabase/supabase-js'
import type { DetectedSubscription } from '@/lib/truelayer/types'
import type { Category } from '@/types/subscription'
import { buildRecurringSubscriptions, type RecurringSubscription } from '@/lib/truelayer/recurrence'

// Aggregator-agnostic part of subscription detection, shared by TrueLayer
// and Salt Edge: each provider turns its own transactions into Charges
// (already filtered down to outgoing, subscription-like ones), and this
// groups them into recurring subscriptions and stores them.

export interface Charge {
  // merchant name, or the raw description when the bank gave none
  name: string
  // positive amount charged
  amount: number
  currency: string
  date?: Date
  description?: string
  // the bank's/aggregator's own categorization, most general first
  classification?: string[]
}

export async function storeDetectedSubscriptions(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  charges: Charge[],
  inferCategory: (sub: RecurringSubscription) => Category,
  logTag: string
): Promise<DetectedSubscription[]> {
  // Analyze for recurring patterns. Charges are grouped by merchant + exact
  // amount: an exact repeat is what tells a subscription apart from
  // unrelated purchases at the same merchant.
  const merchantPattern = new Map<string, {
    label: string
    currency: string
    amounts: number[]
    dates: Date[]
    count: number
    remittanceInfo: string[]
    classifications: string[][]
  }>()

  for (const charge of charges) {
    // Strip anything that looks like a per-transaction reference number so
    // repeat payments to the same payee still group together.
    const cleanedName = charge.name.replace(/\d{4,}/g, '').replace(/\s+/g, ' ').trim()
    if (!cleanedName) continue

    const amount = Math.abs(charge.amount)
    const key = `${cleanedName.toLowerCase()}_${amount.toFixed(2)}`

    let pattern = merchantPattern.get(key)
    if (!pattern) {
      pattern = { label: cleanedName, currency: charge.currency, amounts: [], dates: [], count: 0, remittanceInfo: [], classifications: [] }
      merchantPattern.set(key, pattern)
    }

    if (charge.date) pattern.dates.push(charge.date)
    pattern.amounts.push(amount)
    pattern.count++
    if (charge.description) pattern.remittanceInfo.push(charge.description)
    if (charge.classification?.length) pattern.classifications.push(charge.classification)
  }

  const recurringCandidates = [...merchantPattern.values()].filter(p => p.count >= 2).length
  console.log(`[${logTag}] ${merchantPattern.size} distinct merchant+amount groups, ${recurringCandidates} seen 2+ times`)

  // Stitch each merchant's amount groups into subscriptions, so a price
  // change yields one subscription at its current price (see recurrence.ts).
  const { subscriptions: recurring, dropped } = buildRecurringSubscriptions(
    [...merchantPattern.values()].map(p => ({
      label: p.label,
      currency: p.currency,
      amount: p.amounts[0],
      dates: p.dates,
      remittanceInfo: p.remittanceInfo,
      classifications: p.classifications,
    }))
  )
  const priceChanges = recurring.filter(r => r.priceHistory.length > 1)
  if (priceChanges.length > 0) {
    console.log(
      `[${logTag}] price changes: ` +
      priceChanges.map(r => `${r.label} ${r.priceHistory.join(' -> ')} ${r.currency}`).join('; ')
    )
  }
  if (dropped.length > 0) {
    console.warn(
      `[${logTag}] skipped concurrent same-cycle subscriptions at one merchant (only one row per merchant+cycle can be stored): ` +
      dropped.map(d => `${d.label} ${d.amount} ${d.billingCycle}`).join('; ')
    )
  }

  const detected: DetectedSubscription[] = []

  for (const sub of recurring) {
    const merchantName = sub.label

    const { data, error } = await supabase
      .from('detected_subscriptions')
      .upsert({
        user_id: userId,
        connection_id: connectionId,
        merchant_name: merchantName,
        amount: sub.amount,
        currency: sub.currency,
        billing_cycle: sub.billingCycle,
        first_seen: sub.firstSeen.toISOString().split('T')[0],
        last_seen: sub.lastSeen.toISOString().split('T')[0],
        occurrence_count: sub.occurrenceCount,
        category: inferCategory(sub),
        // is_confirmed intentionally omitted: on a fresh row it takes the
        // column default (false); on a re-detected existing row it's left
        // untouched instead of resetting a prior confirmation back to false.
      }, {
        onConflict: 'user_id,merchant_name,billing_cycle',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      console.error(`Failed to save detected subscription ${merchantName}:`, error)
    } else if (data) {
      detected.push(data as DetectedSubscription)
    }
  }

  detected.sort((a, b) => b.amount - a.amount)
  return detected
}

// Last-resort category guess from the transaction descriptions, for when the
// provider didn't categorize the charges (or used a category we don't map).
export function keywordCategory(remittanceInfos: string[]): Category {
  const text = remittanceInfos.join(' ').toLowerCase()

  if (/netflix|prime|disney|spotify|apple\s*music|youtube/i.test(text)) return 'entertainment'
  if (/google|office|365|adobe|canva|notion|slack/i.test(text)) return 'productivity'
  if (/dropbox|icloud|onedrive|google\s*one|backblaze/i.test(text)) return 'storage'
  if (/phone|mobile|cellular|data\s*plan|internet|broadband|fibre|cable\s*tv|electric|water\s*bill/i.test(text)) return 'utility'
  if (/gym|fitness|yoga|classpass|peloton/i.test(text)) return 'sports'
  if (/udemy|coursera|skillshare|masterclass|duolingo/i.test(text)) return 'education'

  return 'other'
}
