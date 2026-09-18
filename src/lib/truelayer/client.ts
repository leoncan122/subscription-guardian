// TrueLayer Data API client - Server-side only
// Reference: https://docs.truelayer.com/docs/data-api-basics
const TRUELAYER_AUTH = 'https://auth.truelayer-sandbox.com'
const TRUELAYER_API = 'https://api.truelayer-sandbox.com'

export interface TLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
  scope: string
}

export interface TLAccount {
  account_id: string
  account_type: string
  display_name: string
  currency: string
  account_number?: {
    number?: string
    sort_code?: string
    iban?: string
    swift_bic?: string
  }
  provider: {
    provider_id: string
    display_name: string
  }
}

export interface TLBalance {
  currency: string
  available: number
  current: number
  overdraft?: number
  update_timestamp: string
}

export interface TLTransaction {
  transaction_id: string
  timestamp: string
  description: string
  amount: number
  currency: string
  transaction_type: 'DEBIT' | 'CREDIT'
  transaction_category?: string
  transaction_classification?: string[]
  merchant_name?: string
  running_balance?: { currency: string; amount: number }
}

interface TLEnvelope<T> {
  results: T[]
  status: 'Succeeded' | 'Queued' | 'Running' | 'Failed'
}

// ==================== OAuth Flow ====================
// There is no separate "consent" API call - the user is sent straight to the
// authorize link, and TrueLayer collects consent as part of that redirect.

export function buildAuthorizeUrl(redirectUri: string, clientId: string, scope: string): string {
  const authUrl = new URL(`${TRUELAYER_AUTH}/`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('providers', 'uk-cs-mock')
  return authUrl.toString()
}

export async function getToken(code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<TLTokenResponse> {
  const res = await fetch(`${TRUELAYER_AUTH}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description || 'Token exchange failed')
  }

  return res.json()
}

export async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TLTokenResponse> {
  const res = await fetch(`${TRUELAYER_AUTH}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description || 'Token refresh failed')
  }

  return res.json()
}

export async function revokeToken(accessToken: string): Promise<void> {
  const res = await fetch(`${TRUELAYER_AUTH}/api/delete`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error('Token revocation failed')
  }
}

export interface TLMe {
  client_id: string
  credentials_id: string
  consent_status: string
  consent_expires_at?: string
  provider: { provider_id: string; display_name: string }
  scopes: string[]
}

// ==================== Data API ====================
// https://docs.truelayer.com/docs/http-headers
//
// - X-Client-Correlation-Id: optional, ties a Data API call to our own logs
//   (TrueLayer's response carries a separate X-TL-Correlation-Id we don't
//   currently capture).
// - X-PSU-IP: the end user's IP, recommended whenever the call is triggered
//   by that user being active in the app - it tells the bank the request is
//   attended, avoiding the rate limits banks apply to unattended calls.

export interface TLRequestContext {
  correlationId?: string
  psuIp?: string
}

async function api<T>(accessToken: string, path: string, ctx: TLRequestContext = {}): Promise<T[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (ctx.correlationId) headers['X-Client-Correlation-Id'] = ctx.correlationId
  if (ctx.psuIp) headers['X-PSU-IP'] = ctx.psuIp

  const res = await fetch(`${TRUELAYER_API}${path}`, { headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description || 'API call failed')
  }

  const body: TLEnvelope<T> = await res.json()
  return body.results
}

export async function getMe(accessToken: string, ctx?: TLRequestContext): Promise<TLMe> {
  const results = await api<TLMe>(accessToken, '/data/v1/me', ctx)
  return results[0]
}

export async function getAccounts(accessToken: string, ctx?: TLRequestContext): Promise<TLAccount[]> {
  return api<TLAccount>(accessToken, '/data/v1/accounts', ctx)
}

export async function getBalance(accessToken: string, accountId: string, ctx?: TLRequestContext): Promise<TLBalance[]> {
  return api<TLBalance>(accessToken, `/data/v1/accounts/${accountId}/balance`, ctx)
}

export async function getTransactions(accessToken: string, accountId: string, from: string, to?: string, ctx?: TLRequestContext): Promise<TLTransaction[]> {
  const params = new URLSearchParams({ from })
  if (to) params.set('to', to)

  return api<TLTransaction>(accessToken, `/data/v1/accounts/${accountId}/transactions?${params}`, ctx)
}
