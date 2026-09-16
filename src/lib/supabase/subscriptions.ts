import { createClient } from '@/lib/supabase/client'
import { Subscription } from '@/types/subscription'

const supabase = createClient()

export async function getSubscriptions(): Promise<Subscription[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('renewalDate', { ascending: true })

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

export async function getBankConnections(): Promise<Array<{
  id: string
  bank_id: string
  bank_name: string
  status: string
  last_sync: string | null
  created_at: string
}>> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
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
