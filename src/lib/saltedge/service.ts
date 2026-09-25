import type { SupabaseClient } from '@supabase/supabase-js'
import * as SE from '@/lib/saltedge/client'
import type { TrueLayerConnection, TrueLayerAccountDB, DetectedSubscription } from '@/lib/truelayer/types'
import type { Category } from '@/types/subscription'
import { ReconnectRequiredError } from '@/lib/truelayer/service'
import { storeDetectedSubscriptions, keywordCategory, type Charge } from '@/lib/subscription-detection'

// Salt Edge connections live in truelayer_connections with
// aggregator = 'saltedge' (see supabase/migrations/008_saltedge_integration.sql).
// Like the TrueLayer service, every function takes the caller's
// request-scoped Supabase client so RLS applies to the logged-in user.

// Salt Edge categories (personal categorization) that are never a
// subscription, even if the same payee+amount repeats. Matched as
// substrings, since Salt Edge reports the most specific (sub)category.
const NON_SUBSCRIPTION_CATEGORY_HINTS = [
  'transfer', 'income', 'salary', 'atm', 'withdrawal', 'cash', 'tax',
  'interest', 'refund', 'investment', 'loan', 'mortgage',
]

// How far back to fetch transactions on connect. Banks may cap it lower.
const HISTORY_DAYS = 365

// ==================== Customer ====================

// The user's Salt Edge customer id, creating the customer on first use.
export async function getOrCreateCustomerId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('saltedge_customers')
    .select('customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existing?.customer_id) return existing.customer_id

  let customer: SE.SECustomer | null
  try {
    customer = await SE.createCustomer(userId)
  } catch (e) {
    // Created in Salt Edge before but never saved here (e.g. the insert below failed).
    if (!(e instanceof SE.SEError && e.errorClass === 'DuplicatedCustomer')) throw e
    customer = await SE.findCustomerByIdentifier(userId)
    if (!customer) throw e
  }

  const { error } = await supabase
    .from('saltedge_customers')
    .insert({ user_id: userId, customer_id: customer.customer_id })
  if (error) throw new Error(`Failed to save Salt Edge customer: ${error.message}`)

  return customer.customer_id
}

async function getCustomerId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('saltedge_customers')
    .select('customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.customer_id ?? null
}

export async function createConnectSession(
  supabase: SupabaseClient,
  userId: string,
  returnTo: string,
  country?: string,
  locale?: string
): Promise<string> {
  const customerId = await getOrCreateCustomerId(supabase, userId)
  const fromDate = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const session = await SE.createConnectSession({ customerId, returnTo, country, fromDate, locale })
  return session.connect_url
}

// ==================== Connection Management ====================

// Saves the Salt Edge connection the widget just created, after checking it
// really belongs to this user's customer - the connection_id arrives as a
// plain query parameter, so it can't be trusted on its own.
export async function saveConnection(supabase: SupabaseClient, userId: string, saltedgeConnectionId: string): Promise<TrueLayerConnection> {
  const customerId = await getCustomerId(supabase, userId)
  if (!customerId) throw new Error('No Salt Edge customer for this user')

  const remote = await SE.getConnection(saltedgeConnectionId)
  if (remote.customer_id !== customerId) throw new Error('Salt Edge connection does not belong to this user')

  const row = {
    user_id: userId,
    aggregator: 'saltedge',
    saltedge_connection_id: remote.id,
    consent_id: remote.last_consent_id,
    scopes: ['accounts', 'transactions', 'balances'],
    status: remote.status === 'active' ? 'active' : 'expired',
    provider_id: remote.provider_code,
    provider_name: remote.provider_name,
  }

  // Reconnecting the same bank reuses the Salt Edge connection id.
  const { data, error } = await supabase
    .from('truelayer_connections')
    .upsert(row, { onConflict: 'saltedge_connection_id' })
    .select()
    .single()

  if (error) throw new Error(`Failed to save connection: ${error.message}`)
  return data as TrueLayerConnection
}

async function getConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<TrueLayerConnection & { saltedge_connection_id: string }> {
  const { data } = await supabase
    .from('truelayer_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('aggregator', 'saltedge')
    .maybeSingle()
  if (!data?.saltedge_connection_id) throw new Error('Connection not found')
  return data
}

// Throws ReconnectRequiredError when Salt Edge can no longer read this bank
// (connection removed, or inactive/disabled because the consent ran out).
async function ensureUsable(saltedgeConnectionId: string): Promise<SE.SEConnection> {
  let remote: SE.SEConnection
  try {
    remote = await SE.getConnection(saltedgeConnectionId)
  } catch (e) {
    if (e instanceof SE.SEError && e.errorClass === 'ConnectionNotFound') {
      throw new ReconnectRequiredError('Salt Edge connection no longer exists')
    }
    throw e
  }
  if (remote.status !== 'active') {
    throw new ReconnectRequiredError(`Salt Edge connection is ${remote.status}`)
  }
  return remote
}

export async function revokeConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<void> {
  const conn = await getConnection(supabase, userId, connectionId)

  try {
    await SE.removeConnection(conn.saltedge_connection_id)
  } catch (e) {
    console.warn('Salt Edge connection removal failed:', e)
  }

  const { error } = await supabase
    .from('truelayer_connections')
    .update({ status: 'revoked' })
    .eq('id', connectionId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to mark connection revoked: ${error.message}`)

  // Same as TrueLayer: drop pending detections from this bank, keep the
  // confirmed ones (they're the source rows of the user's subscriptions).
  const { error: deleteError } = await supabase
    .from('detected_subscriptions')
    .delete()
    .eq('connection_id', connectionId)
    .eq('user_id', userId)
    .eq('is_confirmed', false)

  if (deleteError) console.error('Failed to delete pending detected subscriptions for revoked connection:', deleteError)
}

// ==================== Account Sync ====================

export async function syncAccounts(supabase: SupabaseClient, userId: string, connectionId: string): Promise<TrueLayerAccountDB[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  const remote = await ensureUsable(conn.saltedge_connection_id)
  const accounts = await SE.getAccounts(remote.customer_id, remote.id)

  const saved: TrueLayerAccountDB[] = []

  for (const acc of accounts) {
    const { data, error } = await supabase
      .from('truelayer_accounts')
      .upsert({
        connection_id: connectionId,
        true_layer_account_id: acc.id,
        account_label: acc.name || null,
        currency: acc.currency_code,
        balance_amount: acc.balance,
        balance_currency: acc.currency_code,
        balance_type: 'current',
      }, {
        onConflict: 'connection_id,true_layer_account_id',
      })
      .select()
      .single()

    if (error) {
      console.error(`Failed to save Salt Edge account ${acc.id}:`, error)
    } else if (data) {
      saved.push(data as TrueLayerAccountDB)
    }
  }

  await supabase
    .from('truelayer_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connectionId)

  return saved
}

// ==================== Subscription Detection ====================

export async function detectSubscriptions(supabase: SupabaseClient, userId: string, connectionId: string, correlationId?: string): Promise<DetectedSubscription[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  const remote = await ensureUsable(conn.saltedge_connection_id)
  const logTag = `saltedge/detect${correlationId ? ' ' + correlationId : ''}`

  const accounts = await SE.getAccounts(remote.customer_id, remote.id)
  const transactions: SE.SETransaction[] = []
  for (const acc of accounts) {
    try {
      transactions.push(...await SE.getTransactions(remote.id, acc.id))
    } catch (e) {
      console.warn(`Failed to fetch Salt Edge transactions for ${acc.id}:`, e)
    }
  }

  const charges: Charge[] = []
  for (const tx of transactions) {
    if (tx.amount >= 0) continue
    if (tx.status === 'pending' || tx.duplicated) continue
    // Bank fees and transfers are never subscriptions, even when they repeat.
    if (tx.mode === 'fee' || tx.mode === 'transfer') continue
    const category = tx.category?.toLowerCase() ?? ''
    if (NON_SUBSCRIPTION_CATEGORY_HINTS.some(hint => category.includes(hint))) continue

    const name = tx.extra?.payee?.trim() || tx.description?.trim()
    if (!name) continue

    charges.push({
      name,
      amount: Math.abs(tx.amount),
      currency: tx.currency_code,
      date: new Date(tx.made_on),
      description: tx.description,
      classification: tx.category ? [tx.category] : undefined,
    })
  }

  console.log(
    `[${logTag}] ${transactions.length} transactions fetched, ${charges.length} eligible ` +
    `(categories seen: ${[...new Set(transactions.map(t => t.category ?? 'null'))].join(', ')})`
  )

  return storeDetectedSubscriptions(
    supabase,
    userId,
    connectionId,
    charges,
    sub => inferCategory(sub.classifications[0]?.[0], sub.remittanceInfo),
    logTag
  )
}

// Salt Edge reports its own category codes (e.g. "internet", "gym",
// "movies_and_music", "software"). Map the ones that clearly fit, and fall
// back to matching the descriptions otherwise.
function inferCategory(category: string | undefined, remittanceInfos: string[]): Category {
  const c = category?.toLowerCase() ?? ''
  if (/entertainment|movie|music|game|hobbies|streaming/.test(c)) return 'entertainment'
  if (/education|tuition|books/.test(c)) return 'education'
  if (/gym|fitness|sport|health/.test(c)) return 'sports'
  if (/bills|utilit|internet|phone|mobile|television|electric|gas|water/.test(c)) return 'utility'
  if (/software|online_services/.test(c)) return 'productivity'
  return keywordCategory(remittanceInfos)
}
