// GoCardless Bank Account Data API client - Server-side only
// Reference: https://developer.gocardless.com/bank-account-data/overview
//
// This is GoCardless's Bank Account Data product (formerly Nordigen), a
// read-only Open Banking data API - not the GoCardless Payments/Direct Debit
// API at docs.gocardless.com. It's the real alternative to TrueLayer here:
// both read accounts/balances/transactions with user consent.
//
// Unlike TrueLayer, there's a single app-wide credential
// (GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY) traded for a short-lived
// access JWT - it's not scoped to one user's bank consent. The token pair is
// cached in module scope (reused across warm invocations of the same
// serverless instance) instead of a DB table, since any table reachable
// through the RLS-scoped Supabase client this app uses (src/lib/supabase/server.ts)
// would let any signed-in user read the app's shared credential.
const GC_API = 'https://bankaccountdata.gocardless.com/api/v2'

interface GCTokenCache {
  access: string
  accessExpiresAt: number
  refresh: string
  refreshExpiresAt: number
}

let tokenCache: GCTokenCache | null = null

async function gcError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text().catch(() => '')
  let detail = text
  try {
    const parsed = JSON.parse(text)
    detail = parsed.detail || parsed.summary || text
  } catch {
    // not JSON - use the raw text as-is
  }
  return new Error(`${fallback} (HTTP ${res.status}): ${detail || '<empty response body>'}`)
}

async function refreshTokenPair(refresh: string, refreshExpiresInSeconds: number): Promise<GCTokenCache> {
  const res = await fetch(`${GC_API}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) throw await gcError(res, 'GoCardless token refresh failed')
  const { access, access_expires } = await res.json()

  const cache: GCTokenCache = {
    access,
    accessExpiresAt: Date.now() + access_expires * 1000,
    refresh,
    refreshExpiresAt: Date.now() + refreshExpiresInSeconds * 1000,
  }
  tokenCache = cache
  return cache
}

async function mintTokenPair(): Promise<GCTokenCache> {
  const res = await fetch(`${GC_API}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID || '',
      secret_key: process.env.GOCARDLESS_SECRET_KEY || '',
    }),
  })
  if (!res.ok) throw await gcError(res, 'GoCardless token creation failed')
  const { refresh, refresh_expires } = await res.json()

  return refreshTokenPair(refresh, refresh_expires)
}

const EXPIRY_BUFFER_MS = 60 * 1000

async function getAccessToken(): Promise<string> {
  const now = Date.now()

  if (tokenCache && tokenCache.accessExpiresAt - EXPIRY_BUFFER_MS > now) {
    return tokenCache.access
  }

  if (tokenCache && tokenCache.refreshExpiresAt - EXPIRY_BUFFER_MS > now) {
    const cache = await refreshTokenPair(tokenCache.refresh, (tokenCache.refreshExpiresAt - now) / 1000)
    return cache.access
  }

  const cache = await mintTokenPair()
  return cache.access
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${GC_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) throw await gcError(res, `GoCardless API call failed (${path})`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ==================== Institutions ====================

export interface GCInstitution {
  id: string
  name: string
  bic: string
  transaction_total_days: string
  max_access_valid_for_days: string
  logo: string
}

export async function getInstitutions(country: string): Promise<GCInstitution[]> {
  return api<GCInstitution[]>(`/institutions/?country=${encodeURIComponent(country)}`)
}

export async function getInstitution(id: string): Promise<GCInstitution> {
  return api<GCInstitution>(`/institutions/${id}/`)
}

// ==================== End User Agreements ====================

export interface GCAgreement {
  id: string
  institution_id: string
  max_historical_days: number
  access_valid_for_days: number
  access_scope: string[]
}

export async function createAgreement(institutionId: string, maxHistoricalDays: number): Promise<GCAgreement> {
  return api<GCAgreement>('/agreements/enduser/', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: maxHistoricalDays,
      access_valid_for_days: 90,
      access_scope: ['balances', 'details', 'transactions'],
    }),
  })
}

// ==================== Requisitions ====================
// A requisition is GoCardless's equivalent of TrueLayer's OAuth consent -
// the user is sent to `link` to authenticate with their bank, then
// GoCardless redirects back to `redirect` once done. Unlike TrueLayer's
// client, `redirect` doesn't need to be pre-registered anywhere.

export interface GCRequisition {
  id: string
  status: string
  institution_id: string
  agreement: string
  reference: string
  link: string
  accounts: string[]
}

export async function createRequisition(institutionId: string, agreementId: string, redirect: string, reference: string): Promise<GCRequisition> {
  return api<GCRequisition>('/requisitions/', {
    method: 'POST',
    body: JSON.stringify({
      redirect,
      institution_id: institutionId,
      agreement: agreementId,
      reference,
      user_language: 'ES',
    }),
  })
}

export async function getRequisition(id: string): Promise<GCRequisition> {
  return api<GCRequisition>(`/requisitions/${id}/`)
}

export async function deleteRequisition(id: string): Promise<void> {
  await api<void>(`/requisitions/${id}/`, { method: 'DELETE' })
}

// ==================== Accounts ====================

export interface GCAccountDetails {
  account: {
    iban?: string
    currency: string
    ownerName?: string
    name?: string
    product?: string
  }
}

export async function getAccountDetails(accountId: string): Promise<GCAccountDetails> {
  return api<GCAccountDetails>(`/accounts/${accountId}/details/`)
}

export interface GCBalance {
  balanceAmount: { amount: string; currency: string }
  balanceType: string
  referenceDate?: string
}

export async function getAccountBalances(accountId: string): Promise<GCBalance[]> {
  const res = await api<{ balances: GCBalance[] }>(`/accounts/${accountId}/balances/`)
  return res.balances
}

export interface GCTransaction {
  transactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  creditorName?: string
  debtorName?: string
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
}

// Data structures vary between banks - not every field above is populated by
// every institution.
export async function getAccountTransactions(accountId: string, dateFrom?: string, dateTo?: string): Promise<GCTransaction[]> {
  const params = new URLSearchParams()
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const qs = params.toString()

  const res = await api<{ transactions: { booked: GCTransaction[]; pending: GCTransaction[] } }>(
    `/accounts/${accountId}/transactions/${qs ? `?${qs}` : ''}`
  )
  return res.transactions.booked
}
