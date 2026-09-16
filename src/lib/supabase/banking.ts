import { supabase } from '@/lib/supabase/client'

export async function connectBank(bankId: string, bankName: string): Promise<{ redirect_url: string }> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: connection, error } = await supabase
    .from('bank_connections')
    .insert({
      user_id: user.id,
      bank_id: bankId,
      bank_name: bankName,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw error

  const redirectUrl = new URL('/api/banking/callback', window.location.origin)
  redirectUrl.searchParams.set('connection_id', connection.id)
  redirectUrl.searchParams.set('bank_id', bankId)

  return { redirect_url: redirectUrl.toString() }
}

export async function processBankingCallback(connectionId: string, transactionData: any): Promise<void> {
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase
    .from('bank_connections')
    .update({
      status: 'connected',
      access_token: 'REDACTED',
      refresh_token: 'REDACTED',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      last_sync: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .eq('user_id', user.id)

  const detectedSubscriptions = extractSubscriptionsFromTransactions(transactionData)

  if (detectedSubscriptions.length > 0) {
    await supabase
      .from('subscriptions')
      .insert(detectedSubscriptions.map(sub => ({
        user_id: user.id,
        name: sub.name,
        amount: sub.amount,
        currency: sub.currency,
        billing_cycle: sub.billingCycle,
        renewal_date: sub.renewalDate,
        payment_method: 'Bank Transfer',
        category: 'other',
        active: true,
      })))
  }
}

function extractSubscriptionsFromTransactions(transactions: any[]): any[] {
  const subscriptionMap = new Map<string, { total: number; count: number; name: string; date: string }>()

  for (const tx of transactions) {
    if (tx.type !== 'RECURRING') continue

    const key = `${tx.merchant}_${tx.amount}`
    const existing = subscriptionMap.get(key)

    if (existing) {
      existing.total += tx.amount
      existing.count += 1
    } else {
      subscriptionMap.set(key, {
        total: tx.amount,
        count: 1,
        name: tx.merchant,
        date: tx.date,
      })
    }
  }

  return Array.from(subscriptionMap.values()).map(item => ({
    name: item.name,
    amount: item.total / item.count,
    currency: 'EUR',
    billingCycle: 'monthly',
    renewalDate: item.date,
  }))
}

export async function syncTransactions(connectionId: string): Promise<any[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const transactions = await fetchBankTransactions(connectionId, user.id)

  await supabase
    .from('bank_connections')
    .update({ last_sync: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('user_id', user.id)

  return transactions
}

async function fetchBankTransactions(connectionId: string, userId: string): Promise<any[]> {
  return []
}

export async function disconnectBank(connectionId: string): Promise<boolean> {
  if (!supabase) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('bank_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', user.id)

  return !error
}
