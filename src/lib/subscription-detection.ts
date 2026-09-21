// Recurring-payment heuristics shared by every bank data provider
// (src/lib/truelayer/service.ts, src/lib/gocardless/service.ts). Provider
// clients group same-merchant/same-amount transactions and hand the
// resulting dates/classification here to decide a billing cycle and category.
import type { Category } from '@/types/subscription'

export function detectBillingCycle(dates: Date[]): string {
  if (dates.length < 3) return 'monthly'

  const gaps: number[] = []
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime())

  for (let i = 1; i < sorted.length; i++) {
    const days = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    gaps.push(days)
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length

  if (avgGap <= 14) return 'biweekly'
  if (avgGap <= 21) return 'weekly'
  if (avgGap <= 45) return 'monthly'
  if (avgGap <= 100) return 'quarterly'
  return 'yearly'
}

// A provider's own transaction classification is preferred when present -
// it's the bank's own categorization, not a keyword guess - and keyword
// matching against the transaction description/remittance info is only a
// fallback for providers or transactions that didn't classify.
// https://docs.truelayer.com/docs/transaction-data-reference
export function inferCategory(classification: string[] | undefined, remittanceInfos: string[]): Category {
  const main = classification?.[0]
  switch (main) {
    case 'Entertainment':
      return 'entertainment'
    case 'Education':
      return 'education'
    case 'Health & Fitness':
      return 'sports'
    case 'Bills & Utilities':
      return 'utility'
    case 'Shopping':
      return classification?.[1] === 'Electronics & Software' ? 'productivity' : 'other'
  }

  const text = remittanceInfos.join(' ').toLowerCase()

  if (/netflix|prime|disney|spotify|apple\s*music|youtube/i.test(text)) return 'entertainment'
  if (/google|office|365|adobe|canva|notion|slack/i.test(text)) return 'productivity'
  if (/dropbox|icloud|onedrive|google\s*one|backblaze/i.test(text)) return 'storage'
  if (/phone|mobile|cellular|data\s*plan|internet|broadband|fibre|cable\s*tv|electric|water\s*bill/i.test(text)) return 'utility'
  if (/gym|fitness|yoga|classpass|peloton/i.test(text)) return 'sports'
  if (/udemy|coursera|skillshare|masterclass|duolingo/i.test(text)) return 'education'

  return 'other'
}
