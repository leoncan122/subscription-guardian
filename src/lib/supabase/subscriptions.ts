import { supabase } from '@/lib/supabase/client'
import { Subscription, Category, BillingCycle } from '@/types/subscription'
import { BASE_PATH } from '@/lib/constants'
import type { BankAggregator } from '@/lib/truelayer/types'

const VALID_CATEGORIES: Category[] = ['entertainment', 'productivity', 'storage', 'sports', 'education', 'utility', 'other']

export async function getSubscriptions(): Promise<Subscription[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('renewal_date', { ascending: true })

  if (error) throw error
  return (data || []).map(normalizeSubscription)
}

export async function addSubscription(sub: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: user.id,
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      billing_cycle: sub.billingCycle,
      renewal_date: sub.renewalDate,
      payment_method: sub.paymentMethod,
      cancellation_info: sub.cancellationInfo,
      category: sub.category,
      active: sub.active,
    })
    .select()
    .single()

  if (error) throw error
  return normalizeSubscription(data)
}

export async function updateSubscription(id: string, updates: Partial<Subscription>): Promise<Subscription | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return normalizeSubscription(data)
}

export async function deleteSubscription(id: string): Promise<boolean> {
  if (!supabase) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  return !error
}

// Confirmed subscriptions outlive the bank connection they were detected
// from (see revokeConnection), so disconnecting a bank doesn't remove them
// on its own. This finds the ones that came from a given connection, via
// their link to detected_subscriptions, so the caller can offer to delete
// them together with the connection.
export async function getSubscriptionIdsForConnection(connectionId: string): Promise<string[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: detected, error: detectedError } = await supabase
    .from('detected_subscriptions')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('user_id', user.id)

  if (detectedError || !detected || detected.length === 0) return []

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('detected_subscription_id', detected.map((d) => d.id))

  if (error || !subs) return []
  return subs.map((s) => s.id)
}

export async function deleteSubscriptions(ids: string[]): Promise<string[]> {
  if (!supabase || ids.length === 0) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
    .in('id', ids)
    .select('id')

  if (error || !data) return []
  return data.map((s) => s.id)
}

export interface TrueLayerConnectionSummary {
  id: string
  status: string
  // which Open Banking provider connected this bank (routes detect/disconnect)
  aggregator: BankAggregator
  // Bank display name from TrueLayer; null for connections not synced since
  // it was added (see backfillProvider in src/lib/truelayer/service.ts).
  provider_name: string | null
  last_synced_at: string | null
  created_at: string
  accounts: Array<{
    id: string
    true_layer_account_id: string
    account_label: string | null
    currency: string | null
    balance_amount: number | null
    balance_currency: string | null
  }>
}

export async function getTrueLayerConnections(): Promise<TrueLayerConnectionSummary[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('truelayer_connections')
    .select('id, status, aggregator, provider_name, last_synced_at, created_at, truelayer_accounts(id, true_layer_account_id, account_label, currency, balance_amount, balance_currency)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((conn) => ({
    id: conn.id,
    status: conn.status,
    aggregator: conn.aggregator ?? 'truelayer',
    provider_name: conn.provider_name ?? null,
    last_synced_at: conn.last_synced_at,
    created_at: conn.created_at,
    accounts: conn.truelayer_accounts || [],
  }))
}

export interface DetectedSubscriptionRow {
  id: string
  merchant_name: string
  amount: number
  currency: string
  billing_cycle: string
  category: string
  occurrence_count: number
  last_seen: string | null
}

export async function getPendingDetectedSubscriptions(): Promise<DetectedSubscriptionRow[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Only detections from banks that are still connected: rows left behind by
  // a revoked connection (e.g. an old sandbox test bank) aren't shown.
  // Two queries instead of an embedded join: the live schema has no foreign
  // key from detected_subscriptions.connection_id to truelayer_connections.
  const { data: connections, error: connError } = await supabase
    .from('truelayer_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (connError) throw connError
  const activeIds = (connections || []).map((c) => c.id)
  if (activeIds.length === 0) return []

  const { data, error } = await supabase
    .from('detected_subscriptions')
    .select('id, merchant_name, amount, currency, billing_cycle, category, occurrence_count, last_seen')
    .eq('user_id', user.id)
    .eq('is_confirmed', false)
    .in('connection_id', activeIds)
    .order('amount', { ascending: false })

  if (error) throw error
  return data || []
}

// Confirming a detected subscription promotes it into the regular
// subscriptions list (so it shows up in "Your Subscriptions"), then marks
// the source row as confirmed so it drops out of the pending review list
// and a future re-detection won't re-surface it.
export async function confirmDetectedSubscription(detected: DetectedSubscriptionRow): Promise<Subscription | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const billingCycle = normalizeBillingCycle(detected.billing_cycle)
  const category = VALID_CATEGORIES.includes(detected.category as Category) ? (detected.category as Category) : 'other'

  let newSub: Subscription | null
  try {
    newSub = await addSubscription({
      name: detected.merchant_name,
      amount: detected.amount,
      currency: detected.currency,
      billingCycle,
      renewalDate: nextRenewalDate(detected.last_seen, billingCycle),
      paymentMethod: 'Bank Account',
      cancellationInfo: '',
      category,
      active: true,
    })
  } catch (error) {
    console.error('Failed to promote detected subscription to subscriptions:', detected.merchant_name, error)
    return null
  }

  if (!newSub) {
    console.error('Failed to promote detected subscription to subscriptions:', detected.merchant_name)
    return null
  }

  const { error } = await supabase
    .from('detected_subscriptions')
    .update({ is_confirmed: true })
    .eq('id', detected.id)

  if (error) {
    console.error('Failed to mark detected subscription confirmed:', error)
  }

  // Link back to the detected row (so future re-detections attach new
  // charges to this subscription automatically) and hand over the charges
  // already stored while it was still pending review.
  const { error: linkError } = await supabase
    .from('subscriptions')
    .update({ detected_subscription_id: detected.id })
    .eq('id', newSub.id)
  if (linkError) console.error('Failed to link subscription to its detected source:', linkError)

  const { error: chargesLinkError } = await supabase
    .from('subscription_charges')
    .update({ subscription_id: newSub.id })
    .eq('detected_subscription_id', detected.id)
    .is('subscription_id', null)
  if (chargesLinkError) console.error('Failed to link charges to confirmed subscription:', chargesLinkError)

  return newSub
}

export interface SubscriptionCharge {
  chargedOn: string
  amount: number
  currency: string
}

export async function getSubscriptionCharges(subscriptionId: string): Promise<SubscriptionCharge[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subscription_charges')
    .select('charged_on, amount, currency')
    .eq('subscription_id', subscriptionId)
    .eq('user_id', user.id)
    .order('charged_on', { ascending: false })

  if (error) {
    console.error('Failed to load subscription charges:', error)
    return []
  }

  return (data || []).map((row: { charged_on: string; amount: number; currency: string }) => ({
    chargedOn: row.charged_on,
    amount: row.amount,
    currency: row.currency,
  }))
}

export async function dismissDetectedSubscription(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('detected_subscriptions')
    .delete()
    .eq('id', id)

  if (error) console.error('Failed to dismiss detected subscription:', error)
  return !error
}

export async function dismissDetectedSubscriptions(ids: string[]): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('detected_subscriptions')
    .delete()
    .in('id', ids)

  if (error) console.error('Failed to dismiss detected subscriptions:', error)
  return !error
}

function normalizeBillingCycle(cycle: string): BillingCycle {
  if (cycle === 'weekly' || cycle === 'monthly' || cycle === 'quarterly' || cycle === 'yearly') return cycle
  if (cycle === 'biweekly') return 'weekly'
  return 'monthly'
}

function nextRenewalDate(lastSeen: string | null, cycle: BillingCycle): string {
  const days: Record<BillingCycle, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }
  const base = lastSeen ? new Date(lastSeen) : new Date()
  base.setDate(base.getDate() + days[cycle])

  // last_seen can be far in the past for infrequent bills - if the computed
  // date already passed, project forward from today instead.
  if (base.getTime() < Date.now()) {
    const fromToday = new Date()
    fromToday.setDate(fromToday.getDate() + days[cycle])
    return fromToday.toISOString().split('T')[0]
  }
  return base.toISOString().split('T')[0]
}

export type RedetectResult = 'ok' | 'reconnect_required' | 'failed'

export async function redetectSubscriptions(connectionId: string, aggregator: BankAggregator): Promise<RedetectResult> {
  try {
    const res = await fetch(`${BASE_PATH}/api/${aggregator}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    })
    if (res.ok) return 'ok'
    const body = await res.json().catch(() => null)
    return body?.code === 'reconnect_required' ? 'reconnect_required' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function disconnectBankConnection(connectionId: string, aggregator: BankAggregator): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_PATH}/api/${aggregator}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    })
    return res.ok
  } catch {
    return false
  }
}

function normalizeSubscription(row: any): Subscription {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    currency: row.currency || 'USD',
    billingCycle: row.billing_cycle || 'monthly',
    renewalDate: row.renewal_date,
    paymentMethod: row.payment_method || '',
    cancellationInfo: row.cancellation_info || '',
    category: (row.category as Subscription['category']) || 'other',
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
