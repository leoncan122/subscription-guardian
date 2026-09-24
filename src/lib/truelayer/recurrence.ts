// Turns groups of identical charges into recurring subscriptions, joining
// the groups of one merchant that are really a single subscription whose
// price changed over time.
//
// Charges are first grouped by merchant + exact amount (see
// detectSubscriptions in service.ts): an exact repeat is what tells a
// subscription apart from unrelated purchases at the same merchant (e.g.
// Amazon Prime vs. random Amazon orders). A price rise splits one
// subscription into an "old price" group and a "new price" group, though -
// this module stitches those back together so the stored amount is the
// current price, not whichever group happened to be processed last.
// No runtime imports on purpose, so it can be tested in isolation.

export interface AmountGroup {
  label: string
  currency: string
  amount: number
  dates: Date[]
  remittanceInfo: string[]
  classifications: string[][]
}

export interface RecurringSubscription {
  label: string
  currency: string
  // price of the most recent charge
  amount: number
  billingCycle: string
  firstSeen: Date
  lastSeen: Date
  occurrenceCount: number
  // distinct prices, oldest first (length > 1 = the price changed)
  priceHistory: number[]
  remittanceInfo: string[]
  classifications: string[][]
}

// Two amounts count as the same subscription at a different price only if
// the larger is at most this many times the smaller. Covers usual price
// rises (13.99 -> 17.99 is 1.29x) while keeping clearly different products
// at the same merchant apart.
const PRICE_CHANGE_MAX_RATIO = 1.5

const CYCLE_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 }
const DAY_MS = 1000 * 60 * 60 * 24

interface Chain {
  // newest group first
  groups: AmountGroup[]
  first: number
  last: number
}

export function buildRecurringSubscriptions(groups: AmountGroup[]): {
  subscriptions: RecurringSubscription[]
  // concurrent same-cycle subscriptions at one merchant that can't be stored
  // (detected_subscriptions is unique per user + merchant + billing cycle)
  dropped: { label: string; amount: number; billingCycle: string }[]
} {
  const byMerchant = new Map<string, AmountGroup[]>()
  for (const g of groups) {
    if (g.dates.length === 0) continue
    const key = `${g.label.toLowerCase()}|${g.currency}`
    const list = byMerchant.get(key) ?? []
    list.push({ ...g, dates: [...g.dates].sort((a, b) => a.getTime() - b.getTime()) })
    byMerchant.set(key, list)
  }

  const built: RecurringSubscription[] = []

  for (const merchantGroups of byMerchant.values()) {
    const recurring = merchantGroups
      .filter((g) => g.dates.length >= 2)
      .sort((a, b) => lastTime(b) - lastTime(a))
    if (recurring.length === 0) continue

    // Newest group first: each older group joins the chain it entirely
    // precedes (an earlier price), otherwise it starts its own chain (a
    // separate subscription running at the same time).
    const chains: Chain[] = []
    for (const g of recurring) {
      const chain = chains.find((c) => lastTime(g) <= c.first && similarPrice(g.amount, c.groups[c.groups.length - 1].amount))
      if (chain) {
        chain.groups.push(g)
        chain.first = firstTime(g)
      } else {
        chains.push({ groups: [g], first: firstTime(g), last: lastTime(g) })
      }
    }

    // A single charge after the chain at a new price, roughly one cycle
    // later, is a price rise that hasn't repeated yet.
    const singles = merchantGroups.filter((g) => g.dates.length === 1)
    const claimed = new Set<AmountGroup>()

    built.push(...chains.map((chain) => {
      const cycle = detectBillingCycle(chain.groups.flatMap((g) => g.dates))
      const cycleMs = (CYCLE_DAYS[cycle] ?? 30) * DAY_MS
      const newest = chain.groups[0]

      const rise = singles
        .filter((s) => !claimed.has(s) && s.amount !== newest.amount && similarPrice(s.amount, newest.amount))
        .filter((s) => {
          const gap = firstTime(s) - chain.last
          return gap >= cycleMs * 0.5 && gap <= cycleMs * 1.5
        })
        .sort((a, b) => lastTime(b) - lastTime(a))[0]
      if (rise) claimed.add(rise)

      const members = rise ? [rise, ...chain.groups] : chain.groups
      const dates = members.flatMap((g) => g.dates).sort((a, b) => a.getTime() - b.getTime())

      return {
        label: newest.label,
        currency: newest.currency,
        amount: members[0].amount,
        billingCycle: cycle,
        firstSeen: dates[0],
        lastSeen: dates[dates.length - 1],
        occurrenceCount: dates.length,
        priceHistory: [...members].reverse().map((g) => g.amount).filter((a, i, all) => all.indexOf(a) === i),
        remittanceInfo: members.flatMap((g) => g.remittanceInfo),
        classifications: members.flatMap((g) => g.classifications),
      }
    }))
  }

  // Only one row per merchant + cycle can be stored (whatever the currency):
  // keep the most recently charged one, deterministically, and report the rest.
  const kept = new Map<string, RecurringSubscription>()
  const dropped: { label: string; amount: number; billingCycle: string }[] = []
  for (const sub of built) {
    const key = `${sub.label.toLowerCase()}|${sub.billingCycle}`
    const existing = kept.get(key)
    if (!existing || sub.lastSeen > existing.lastSeen) {
      if (existing) dropped.push({ label: existing.label, amount: existing.amount, billingCycle: existing.billingCycle })
      kept.set(key, sub)
    } else {
      dropped.push({ label: sub.label, amount: sub.amount, billingCycle: sub.billingCycle })
    }
  }

  return { subscriptions: [...kept.values()], dropped }
}

export function detectBillingCycle(dates: Date[]): string {
  if (dates.length < 3) return 'monthly'

  const gaps: number[] = []
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())

  for (let i = 1; i < sorted.length; i++) {
    const days = (sorted[i].getTime() - sorted[i - 1].getTime()) / DAY_MS
    gaps.push(days)
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length

  if (avgGap <= 14) return 'biweekly'
  if (avgGap <= 21) return 'weekly'
  if (avgGap <= 45) return 'monthly'
  if (avgGap <= 100) return 'quarterly'
  return 'yearly'
}

function similarPrice(a: number, b: number): boolean {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return lo > 0 && hi / lo <= PRICE_CHANGE_MAX_RATIO
}

function firstTime(g: AmountGroup): number {
  return g.dates[0].getTime()
}

function lastTime(g: AmountGroup): number {
  return g.dates[g.dates.length - 1].getTime()
}
