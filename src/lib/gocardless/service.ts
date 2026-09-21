import type { SupabaseClient } from '@supabase/supabase-js'
import * as GC from '@/lib/gocardless/client'
import type { GCTransaction } from '@/lib/gocardless/client'
import type { GoCardlessConnection, GoCardlessAccountDB } from '@/lib/gocardless/types'
import type { DetectedSubscription } from '@/lib/truelayer/types'
import { detectBillingCycle, inferCategory } from '@/lib/subscription-detection'

// All functions below take the caller's request-scoped Supabase client (see
// src/lib/supabase/server.ts) so RLS policies evaluate against the actual
// logged-in user's session, not an anonymous connection.

// ==================== Connection Management ====================

export async function createConnection(
  supabase: SupabaseClient,
  userId: string,
  requisitionId: string,
  agreementId: string,
  institutionId: string,
  reference: string
): Promise<GoCardlessConnection> {
  const { data, error } = await supabase
    .from('gocardless_connections')
    .insert({
      user_id: userId,
      requisition_id: requisitionId,
      agreement_id: agreementId,
      institution_id: institutionId,
      reference,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create connection: ${error.message}`)
  return data as GoCardlessConnection
}

export async function getConnectionByReference(supabase: SupabaseClient, userId: string, reference: string): Promise<GoCardlessConnection | null> {
  const { data } = await supabase
    .from('gocardless_connections')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', userId)
    .maybeSingle()
  return data as GoCardlessConnection | null
}

export async function getConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<GoCardlessConnection | null> {
  const { data } = await supabase
    .from('gocardless_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as GoCardlessConnection | null
}

export async function getConnections(supabase: SupabaseClient, userId: string): Promise<GoCardlessConnection[]> {
  const { data } = await supabase
    .from('gocardless_connections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data as GoCardlessConnection[]
}

export async function revokeConnection(supabase: SupabaseClient, userId: string, connectionId: string): Promise<void> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) return

  try {
    await GC.deleteRequisition(conn.requisition_id)
  } catch (e) {
    console.warn('GoCardless requisition deletion failed:', e)
  }

  await supabase
    .from('gocardless_connections')
    .update({ status: 'revoked' })
    .eq('id', connectionId)
    .eq('user_id', userId)
}

// ==================== Linking & Account Sync ====================
// GoCardless has no token exchange step like TrueLayer's OAuth callback - the
// requisition itself moves from status 'CR' (created) to 'LN' (linked) once
// the user finishes authenticating with their bank on GoCardless's hosted
// page, and `accounts` on the requisition is only populated then.

export async function linkAndSyncAccounts(supabase: SupabaseClient, userId: string, connectionId: string): Promise<GoCardlessAccountDB[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const requisition = await GC.getRequisition(conn.requisition_id)
  if (requisition.status !== 'LN') {
    throw new Error(`Requisition not linked yet (status: ${requisition.status})`)
  }

  const accounts: GoCardlessAccountDB[] = []

  for (const accountId of requisition.accounts) {
    let iban: string | null = null
    let ownerName: string | null = null
    let currency = 'EUR'
    try {
      const details = await GC.getAccountDetails(accountId)
      iban = details.account.iban || null
      ownerName = details.account.ownerName || details.account.name || null
      currency = details.account.currency || 'EUR'
    } catch (e) {
      console.warn(`Failed to get details for account ${accountId}:`, e)
    }

    let balanceAmount: number | null = null
    let balanceCurrency = currency
    try {
      const balances = await GC.getAccountBalances(accountId)
      const balance = balances.find(b => b.balanceType === 'interimAvailable') || balances[0]
      if (balance) {
        balanceAmount = parseFloat(balance.balanceAmount.amount)
        balanceCurrency = balance.balanceAmount.currency
      }
    } catch (e) {
      console.warn(`Failed to get balance for account ${accountId}:`, e)
    }

    const { data, error } = await supabase
      .from('gocardless_accounts')
      .upsert({
        connection_id: connectionId,
        gocardless_account_id: accountId,
        account_label: ownerName,
        iban,
        currency,
        balance_amount: balanceAmount,
        balance_currency: balanceCurrency,
        balance_type: 'interimAvailable',
      }, {
        onConflict: 'connection_id,gocardless_account_id',
      })
      .select()
      .single()

    if (error) {
      console.error(`Failed to save account ${accountId}:`, error)
    } else if (data) {
      accounts.push(data as GoCardlessAccountDB)
    }
  }

  await supabase
    .from('gocardless_connections')
    .update({ status: 'active', last_synced_at: new Date().toISOString() })
    .eq('id', connectionId)

  return accounts
}

// ==================== Subscription Detection ====================

export async function detectSubscriptions(supabase: SupabaseClient, userId: string, connectionId: string): Promise<DetectedSubscription[]> {
  const conn = await getConnection(supabase, userId, connectionId)
  if (!conn) throw new Error('Connection not found')

  const { data: accountRows } = await supabase
    .from('gocardless_accounts')
    .select('gocardless_account_id')
    .eq('connection_id', connectionId)

  const accountIds = (accountRows || []).map((a: { gocardless_account_id: string }) => a.gocardless_account_id)

  const allTransactions: GCTransaction[] = []
  for (const accountId of accountIds) {
    try {
      const txs = await GC.getAccountTransactions(accountId, '2024-01-01')
      allTransactions.push(...txs)
    } catch (e) {
      console.warn(`Failed to fetch transactions for ${accountId}:`, e)
    }
  }

  // GoCardless (like the XS2A-based European banks behind TrueLayer) doesn't
  // expose a reliable, bank-agnostic transaction category - bankTransactionCode
  // varies wildly per institution. Fall back to the sign of the amount
  // instead: negative = money out, the convention this API's docs show for
  // transactionAmount - the same approach TrueLayer's DEBIT-only fallback
  // uses for Spanish banks (see src/lib/truelayer/service.ts).
  const debitTransactions = allTransactions.filter(tx => parseFloat(tx.transactionAmount.amount) < 0)

  const merchantPattern = new Map<string, {
    label: string
    total: number
    count: number
    dates: Date[]
    remittanceInfo: string[]
  }>()

  for (const tx of debitTransactions) {
    const rawName = tx.creditorName?.trim()
      || tx.remittanceInformationUnstructured?.trim()
      || tx.remittanceInformationUnstructuredArray?.join(' ').trim()
    if (!rawName) continue

    const cleanedName = rawName.replace(/\d{4,}/g, '').replace(/\s+/g, ' ').trim()
    if (!cleanedName) continue

    const amount = Math.abs(parseFloat(tx.transactionAmount.amount))
    const key = `${cleanedName.toLowerCase()}_${amount.toFixed(2)}`

    let pattern = merchantPattern.get(key)
    if (!pattern) {
      pattern = { label: cleanedName, total: 0, count: 0, dates: [], remittanceInfo: [] }
      merchantPattern.set(key, pattern)
    }

    const date = tx.bookingDate || tx.valueDate
    if (date) pattern.dates.push(new Date(date))

    pattern.total += amount
    pattern.count++
    if (tx.remittanceInformationUnstructured) pattern.remittanceInfo.push(tx.remittanceInformationUnstructured)
  }

  const detected: DetectedSubscription[] = []

  for (const [, pattern] of merchantPattern) {
    if (pattern.count < 2) continue

    const billingCycle = detectBillingCycle(pattern.dates)
    const avgAmount = pattern.total / pattern.count
    const category = inferCategory(undefined, pattern.remittanceInfo)
    const sortedDates = [...pattern.dates].sort((a, b) => a.getTime() - b.getTime())

    const { data, error } = await supabase
      .from('detected_subscriptions')
      .upsert({
        user_id: userId,
        connection_id: connectionId,
        provider: 'gocardless',
        merchant_name: pattern.label,
        amount: avgAmount,
        currency: 'EUR',
        billing_cycle: billingCycle,
        first_seen: sortedDates[0]?.toISOString().split('T')[0],
        last_seen: sortedDates[sortedDates.length - 1]?.toISOString().split('T')[0],
        occurrence_count: pattern.count,
        category,
        // is_confirmed intentionally omitted - see src/lib/truelayer/service.ts
      }, {
        onConflict: 'user_id,merchant_name,billing_cycle',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      console.error(`Failed to save detected subscription ${pattern.label}:`, error)
    } else if (data) {
      detected.push(data as DetectedSubscription)
    }
  }

  detected.sort((a, b) => b.amount - a.amount)
  return detected
}
