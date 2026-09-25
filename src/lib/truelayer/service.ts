import type { SupabaseClient } from '@supabase/supabase-js'
import * as TL from '@/lib/truelayer/client'
import type { TLTransaction } from '@/lib/truelayer/client'
import type {
  TrueLayerConnection,
  TrueLayerAccountDB,
  DetectedSubscription,
} from '@/lib/truelayer/types'
import type { Category } from '@/types/subscription'
import { storeDetectedSubscriptions, keywordCategory, type Charge } from '@/lib/subscription-detection'

// Transaction categories that a recurring service could plausibly be billed
// under. Excludes ATM, CASH, CASHBACK, CHEQUE, TRANSFER, FEE_CHARGE, CREDIT,
// INTEREST, DIVIDEND, CORRECTION, UNKNOWN - none of those are subscriptions,
// even if the same merchant+amount happens to repeat.
// DEBIT is included too: UK Open Banking breaks debits down into the
// specific categories above, but XS2A providers (e.g. Spanish banks like
// BBVA) often only report the coarse DEBIT/CREDIT direction with no finer
// categorization - without it, nothing from those banks would ever match.
// https://docs.truelayer.com/docs/transaction-data-reference
const SUBSCRIPTION_LIKE_CATEGORIES = new Set(['DIRECT_DEBIT', 'STANDING_ORDER', 'PURCHASE', 'BILL_PAYMENT', 'DEBIT'])

// All functions below take the caller's request-scoped Supabase client (see
// src/lib/supabase/server.ts) so RLS policies evaluate against the actual
// logged-in user's session, not an anonymous connection.

// Thrown when the stored bank access can't be used or renewed any more
// (expired token with no refresh token, or a refresh token TrueLayer
// rejects). Only a new consent - reconnecting the bank - fixes it.
export class ReconnectRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReconnectRequiredError'
  }
}

// ==================== Connection Management ====================

export async function createConnection(
  supabase: SupabaseClient,
  userId: string,
  consentId: string,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  provider?: { provider_id: string; display_name: string }
): Promise<TrueLayerConnection> {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

  const { data, error } = await supabase
    .from('truelayer_connections')
    .insert({
      user_id: userId,
      consent_id: consentId,
      scopes: ['accounts', 'transactions', 'balances'],
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires_at: expiresAt,
      status: 'active',
      provider_id: provider?.provider_id ?? null,
      provider_name: provider?.display_name ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create connection: ${error.message}`)
  return data as TrueLayerConnection
}

export async function getConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<TrueLayerConnection | null> {
  const { data } = await supabase
    .from('truelayer_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as TrueLayerConnection | null
}

export async function getConnections(supabase: SupabaseClient, userId: string): Promise<TrueLayerConnection[]> {
  const { data } = await supabase
    .from('truelayer_connections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data as TrueLayerConnection[]
}

export async function revokeConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<void> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) return

  if (conn.access_token) {
    try {
      await TL.revokeToken(conn.access_token)
    } catch (e) {
      console.warn('TrueLayer token revocation failed:', e)
    }
  }

  const { error } = await supabase
    .from('truelayer_connections')
    .update({
      status: 'revoked',
      access_token: null,
      refresh_token: null,
    })
    .eq('id', connectionId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to mark connection revoked: ${error.message}`)

  // Pending detections from this bank would otherwise stay in the review
  // list forever. Confirmed ones are kept: they're the source rows of the
  // user's subscriptions.
  const { error: deleteError } = await supabase
    .from('detected_subscriptions')
    .delete()
    .eq('connection_id', connectionId)
    .eq('user_id', userId)
    .eq('is_confirmed', false)

  if (deleteError) console.error('Failed to delete pending detected subscriptions for revoked connection:', deleteError)
}

// ==================== Token Refresh ====================

async function getValidAccessToken(supabase: SupabaseClient, conn: TrueLayerConnection): Promise<string> {
  // Refresh a little before expiry, so the token doesn't lapse mid-request.
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : null
  const expiringSoon = expiresAt !== null && expiresAt < Date.now() + 5 * 60 * 1000

  if (!expiringSoon) {
    if (!conn.access_token) throw new ReconnectRequiredError('No access token available')
    return conn.access_token
  }

  if (!conn.refresh_token) {
    // Connections made before offline_access was requested never got one.
    throw new ReconnectRequiredError('Bank access expired and this connection has no refresh token')
  }

  let refreshed: TL.TLTokenResponse
  try {
    refreshed = await TL.refreshAccessToken(
      conn.refresh_token,
      process.env.TRUELAYER_CLIENT_ID || '',
      process.env.TRUELAYER_CLIENT_SECRET || ''
    )
  } catch (e) {
    // invalid_grant = refresh token expired/revoked (e.g. the bank consent
    // ran out). Anything else (network, invalid_client from bad config) must
    // not retire the connection, so let it surface as-is.
    if (e instanceof TL.TLError && e.code === 'invalid_grant') {
      throw new ReconnectRequiredError(`Token refresh rejected: ${e.message}`)
    }
    throw e
  }

  const { error } = await supabase
    .from('truelayer_connections')
    .update({
      access_token: refreshed.access_token,
      // TrueLayer may rotate the refresh token; keep the old one if not.
      refresh_token: refreshed.refresh_token || conn.refresh_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq('id', conn.id)

  if (error) console.error('Failed to store refreshed TrueLayer token:', error)

  return refreshed.access_token
}

// Marks a connection whose access can't be renewed, so the dashboard stops
// offering actions on it and shows "Connect your bank" instead.
export async function markConnectionExpired(supabase: SupabaseClient, userId: string, connectionId: string): Promise<void> {
  const { error } = await supabase
    .from('truelayer_connections')
    .update({ status: 'expired', access_token: null, refresh_token: null })
    .eq('id', connectionId)
    .eq('user_id', userId)

  if (error) console.error('Failed to mark connection expired:', error)
}

// ==================== Account Sync ====================

export async function syncAccounts(supabase: SupabaseClient, userId: string, connectionId: string, ctx?: TL.TLRequestContext): Promise<TrueLayerAccountDB[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const token = await getValidAccessToken(supabase, conn)
  const accounts = await TL.getAccounts(token, ctx)
  await backfillProvider(supabase, conn, accounts)

  const truelayerAccounts: TrueLayerAccountDB[] = []

  for (const acc of accounts) {
    let balanceAmount: number | null = null
    let balanceCurrency = acc.currency || 'GBP'
    try {
      const balances = await TL.getBalance(token, acc.account_id, ctx)
      const balance = balances[0]
      if (balance) {
        balanceAmount = balance.current
        balanceCurrency = balance.currency
      }
    } catch (e) {
      console.warn(`Failed to get balance for account ${acc.account_id}:`, e)
    }

    const { data, error } = await supabase
      .from('truelayer_accounts')
      .upsert({
        connection_id: connectionId,
        true_layer_account_id: acc.account_id,
        account_label: acc.display_name || null,
        currency: balanceCurrency,
        balance_amount: balanceAmount,
        balance_currency: balanceCurrency,
        balance_type: 'current',
      }, {
        onConflict: 'connection_id,true_layer_account_id',
      })
      .select()
      .single()

    if (error) {
      console.error(`Failed to save account ${acc.account_id}:`, error)
    } else if (data) {
      truelayerAccounts.push(data as TrueLayerAccountDB)
    }
  }

  await supabase
    .from('truelayer_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connectionId)

  return truelayerAccounts
}

// Connections made before provider_name existed get it from the accounts
// we're already fetching (every account carries its provider), so no extra
// TrueLayer call is needed. Best-effort: a failure only means the generic
// label stays a while longer.
async function backfillProvider(supabase: SupabaseClient, conn: TrueLayerConnection, accounts: TL.TLAccount[]): Promise<void> {
  if (conn.provider_name) return
  const provider = accounts.find(a => a.provider?.display_name)?.provider
  if (!provider) return

  const { error } = await supabase
    .from('truelayer_connections')
    .update({ provider_id: provider.provider_id, provider_name: provider.display_name })
    .eq('id', conn.id)
  if (error) console.warn(`Failed to save provider for connection ${conn.id}:`, error)
}

// ==================== Subscription Detection ====================

export async function detectSubscriptions(supabase: SupabaseClient, userId: string, connectionId: string, ctx?: TL.TLRequestContext): Promise<DetectedSubscription[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const token = await getValidAccessToken(supabase, conn)

  const allTransactions: TLTransaction[] = []

  // Fetch accounts to get all account IDs
  const accounts = await TL.getAccounts(token, ctx)
  await backfillProvider(supabase, conn, accounts)
  for (const acc of accounts) {
    try {
      const txs = await TL.getTransactions(token, acc.account_id, '2024-01-01', undefined, ctx)
      // Some providers omit the per-transaction currency - use the account's.
      allTransactions.push(...txs.map(tx => ({ ...tx, currency: tx.currency || acc.currency })))
    } catch (e) {
      console.warn(`Failed to fetch transactions for ${acc.account_id}:`, e)
    }
  }

  const categoryEligible = allTransactions.filter(
    tx => tx.transaction_type === 'DEBIT' && tx.transaction_category && SUBSCRIPTION_LIKE_CATEGORIES.has(tx.transaction_category)
  )
  console.log(
    `[detectSubscriptions${ctx?.correlationId ? ' ' + ctx.correlationId : ''}] ` +
    `${allTransactions.length} transactions fetched, ${categoryEligible.length} category-eligible ` +
    `(categories seen: ${[...new Set(allTransactions.map(t => t.transaction_category ?? 'null'))].join(', ')})`
  )

  // Only transactions posted under a category a recurring service could
  // plausibly use are considered - this rules out one-off purchases that
  // happen to share a merchant+amount by coincidence (e.g. two unrelated ATM
  // withdrawals of the same round amount).
  let missingMerchantName = 0
  const charges: Charge[] = []

  for (const tx of categoryEligible) {
    // merchant_name isn't always populated (sandbox mock data rarely sets
    // it) - fall back to the raw description.
    if (!tx.merchant_name?.trim()) missingMerchantName++
    const rawName = tx.merchant_name?.trim() || tx.description?.trim()
    if (!rawName) continue

    charges.push({
      name: rawName,
      amount: Math.abs(tx.amount),
      currency: tx.currency || 'GBP',
      date: tx.timestamp ? new Date(tx.timestamp) : undefined,
      description: tx.description,
      classification: tx.transaction_classification,
    })
  }

  const logTag = `detectSubscriptions${ctx?.correlationId ? ' ' + ctx.correlationId : ''}`
  console.log(`[${logTag}] ${missingMerchantName} transactions had no merchant_name, used description instead`)

  return storeDetectedSubscriptions(
    supabase,
    userId,
    connectionId,
    charges,
    sub => inferCategory(sub.classifications[0], sub.remittanceInfo),
    logTag
  )
}

// TrueLayer's transaction_classification is a [mainCategory, subCategory, ...]
// path (e.g. ["Bills & Utilities", "Television"]). Prefer it when present -
// it's the bank's own categorization, not a keyword guess - and only fall
// back to matching the transaction description when TrueLayer didn't
// classify it (it doesn't cover CREDIT transactions, and only UK/IE/FR banks
// are supported). https://docs.truelayer.com/docs/transaction-data-reference
function inferCategory(classification: string[] | undefined, remittanceInfos: string[]): Category {
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

  return keywordCategory(remittanceInfos)
}
