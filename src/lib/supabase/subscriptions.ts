import { supabase } from '@/lib/supabase/client'
import { Subscription, Category, BillingCycle } from '@/types/subscription'
import { BASE_PATH } from '@/lib/constants'

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

export interface TrueLayerConnectionSummary {
  id: string
  status: string
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
    .select('id, status, last_synced_at, created_at, truelayer_accounts(id, true_layer_account_id, account_label, currency, balance_amount, balance_currency)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((conn) => ({
    id: conn.id,
    status: conn.status,
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

  const { data, error } = await supabase
    .from('detected_subscriptions')
    .select('id, merchant_name, amount, currency, billing_cycle, category, occurrence_count, last_seen')
    .eq('user_id', user.id)
    .eq('is_confirmed', false)
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

  return newSub
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

export async function redetectSubscriptions(connectionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_PATH}/api/truelayer/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function disconnectTrueLayerConnection(connectionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_PATH}/api/truelayer/disconnect`, {
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
