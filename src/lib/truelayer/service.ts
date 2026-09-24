import type { SupabaseClient } from '@supabase/supabase-js'
import * as TL from '@/lib/truelayer/client'
import type { TLTransaction } from '@/lib/truelayer/client'
import type {
  TrueLayerConnection,
  TrueLayerAccountDB,
  DetectedSubscription,
} from '@/lib/truelayer/types'
import type { Category } from '@/types/subscription'
import { buildRecurringSubscriptions } from '@/lib/truelayer/recurrence'

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

// ==================== Connection Management ====================

export async function createConnection(
  supabase: SupabaseClient,
  userId: string,
  consentId: string,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
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
  if (!conn?.access_token) return

  try {
    await TL.revokeToken(conn.access_token)
  } catch (e) {
    console.warn('TrueLayer token revocation failed:', e)
  }

  await supabase
    .from('truelayer_connections')
    .update({
      status: 'revoked',
      access_token: null,
      refresh_token: null,
    })
    .eq('id', connectionId)
    .eq('user_id', userId)
}

// ==================== Token Refresh ====================

async function getValidAccessToken(supabase: SupabaseClient, conn: TrueLayerConnection): Promise<string> {
  if (conn.access_token_expires_at && new Date(conn.access_token_expires_at) < new Date(Date.now() - 5 * 60 * 1000)) {
    if (!conn.refresh_token) {
      throw new Error('Token expired and no refresh token available')
    }

    const refreshed = await TL.refreshAccessToken(
      conn.refresh_token,
      process.env.TRUELAYER_CLIENT_ID || '',
      process.env.TRUELAYER_CLIENT_SECRET || ''
    )

    await supabase
      .from('truelayer_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq('id', conn.id)

    return refreshed.access_token
  }

  if (!conn.access_token) {
    throw new Error('No access token available')
  }
  return conn.access_token
}

// ==================== Account Sync ====================

export async function syncAccounts(supabase: SupabaseClient, userId: string, connectionId: string, ctx?: TL.TLRequestContext): Promise<TrueLayerAccountDB[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const token = await getValidAccessToken(supabase, conn)
  const accounts = await TL.getAccounts(token, ctx)

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

// ==================== Subscription Detection ====================

export async function detectSubscriptions(supabase: SupabaseClient, userId: string, connectionId: string, ctx?: TL.TLRequestContext): Promise<DetectedSubscription[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const token = await getValidAccessToken(supabase, conn)

  const allTransactions: TLTransaction[] = []

  // Fetch accounts to get all account IDs
  const accounts = await TL.getAccounts(token, ctx)
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

  // Analyze for recurring patterns. Only transactions posted under a category
  // a recurring service could plausibly use are considered - this rules out
  // one-off purchases that happen to share a merchant+amount by coincidence
  // (e.g. two unrelated ATM withdrawals of the same round amount).
  const merchantPattern = new Map<string, {
    label: string
    currency: string
    amounts: number[]
    dates: Date[]
    total: number
    count: number
    remittanceInfo: string[]
    classifications: string[][]
  }>()

  let missingMerchantName = 0

  for (const tx of allTransactions) {
    if (tx.transaction_type !== 'DEBIT') continue
    if (!tx.transaction_category || !SUBSCRIPTION_LIKE_CATEGORIES.has(tx.transaction_category)) continue

    // merchant_name isn't always populated (sandbox mock data rarely sets
    // it) - fall back to the raw description, stripped of anything that
    // looks like a per-transaction reference number so repeat payments to
    // the same payee still group together.
    if (!tx.merchant_name?.trim()) missingMerchantName++
    const rawName = tx.merchant_name?.trim() || tx.description?.trim()
    if (!rawName) continue

    const cleanedName = rawName.replace(/\d{4,}/g, '').replace(/\s+/g, ' ').trim()
    if (!cleanedName) continue

    const amount = Math.abs(tx.amount)
    const key = `${cleanedName.toLowerCase()}_${amount.toFixed(2)}`

    let pattern = merchantPattern.get(key)
    if (!pattern) {
      pattern = { label: cleanedName, currency: tx.currency || 'GBP', amounts: [], dates: [], total: 0, count: 0, remittanceInfo: [], classifications: [] }
      merchantPattern.set(key, pattern)
    }

    if (tx.timestamp) {
      pattern.dates.push(new Date(tx.timestamp))
    }

    pattern.amounts.push(amount)
    pattern.total += amount
    pattern.count++

    if (tx.description) {
      pattern.remittanceInfo.push(tx.description)
    }
    if (tx.transaction_classification?.length) {
      pattern.classifications.push(tx.transaction_classification)
    }
  }

  const recurringCandidates = [...merchantPattern.values()].filter(p => p.count >= 2).length
  console.log(
    `[detectSubscriptions${ctx?.correlationId ? ' ' + ctx.correlationId : ''}] ` +
    `${merchantPattern.size} distinct merchant+amount groups (${missingMerchantName} transactions had no merchant_name, used description instead), ` +
    `${recurringCandidates} seen 2+ times`
  )

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
      `[detectSubscriptions${ctx?.correlationId ? ' ' + ctx.correlationId : ''}] price changes: ` +
      priceChanges.map(r => `${r.label} ${r.priceHistory.join(' -> ')} ${r.currency}`).join('; ')
    )
  }
  if (dropped.length > 0) {
    console.warn(
      `[detectSubscriptions${ctx?.correlationId ? ' ' + ctx.correlationId : ''}] ` +
      `skipped concurrent same-cycle subscriptions at one merchant (only one row per merchant+cycle can be stored): ` +
      dropped.map(d => `${d.label} ${d.amount} ${d.billingCycle}`).join('; ')
    )
  }

  const detected: DetectedSubscription[] = []

  for (const sub of recurring) {
    const category = inferCategory(sub.classifications[0], sub.remittanceInfo)
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
        category,
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

  const text = remittanceInfos.join(' ').toLowerCase()

  if (/netflix|prime|disney|spotify|apple\s*music|youtube/i.test(text)) return 'entertainment'
  if (/google|office|365|adobe|canva|notion|slack/i.test(text)) return 'productivity'
  if (/dropbox|icloud|onedrive|google\s*one|backblaze/i.test(text)) return 'storage'
  if (/phone|mobile|cellular|data\s*plan|internet|broadband|fibre|cable\s*tv|electric|water\s*bill/i.test(text)) return 'utility'
  if (/gym|fitness|yoga|classpass|peloton/i.test(text)) return 'sports'
  if (/udemy|coursera|skillshare|masterclass|duolingo/i.test(text)) return 'education'

  return 'other'
}
