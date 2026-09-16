import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export async function connectBank(bankId: string, bankName: string): Promise<{ redirect_url: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // In production, this would call your Open Banking provider
  // For now, store the connection and simulate the OAuth flow
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

  // Simulate OAuth redirect URL
  // In production, this would be your Open Banking provider's OAuth URL
  const redirectUrl = new URL('/api/banking/callback', window.location.origin)
  redirectUrl.searchParams.set('connection_id', connection.id)
  redirectUrl.searchParams.set('bank_id', bankId)

  return { redirect_url: redirectUrl.toString() }
}

export async function processBankingCallback(connectionId: string, transactionData: any): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Update connection status
  await supabase
    .from('bank_connections')
    .update({
      status: 'connected',
      access_token: 'REDACTED', // Never expose real tokens
      refresh_token: 'REDACTED',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      last_sync: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .eq('user_id', user.id)

  // Extract subscriptions from transactions
  // This is where Open Banking transaction data gets parsed
  const detectedSubscriptions = extractSubscriptionsFromTransactions(transactionData)

  // Insert detected subscriptions into Supabase
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
  // In production, this would use sophisticated algorithms to detect recurring payments
  // For now, a simple implementation that groups similar transactions
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // In production, call your Open Banking provider's transaction endpoint
  // This returns the last 90 days of transactions
  const transactions = await fetchBankTransactions(connectionId, user.id)

  // Update last_sync timestamp
  await supabase
    .from('bank_connections')
    .update({ last_sync: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('user_id', user.id)

  return transactions
}

async function fetchBankTransactions(connectionId: string, userId: string): Promise<any[]> {
  // In production, this would call your backend server which holds the bank access tokens
  // The backend would then call the Open Banking provider's API
  // For now, return empty array - production needs a backend service for this

  return []
}

export async function disconnectBank(connectionId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('bank_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', user.id)

  return !error
}
