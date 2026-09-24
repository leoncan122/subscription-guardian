// TrueLayer Data API client - Server-side only
// Reference: https://docs.truelayer.com/docs/data-api-basics
//
// Sandbox vs live is controlled by TRUELAYER_ENV, not hardcoded, so local
// dev always stays on sandbox (mock banks, safe to test against) even when
// production is configured for live (real banks, real client credentials).
// Sandbox and live client_id/client_secret are not interchangeable - mixing
// a live client_id with the sandbox domain (or vice versa) fails with
// "unknown client or client not enabled".
const IS_LIVE = process.env.TRUELAYER_ENV === 'live'
const TRUELAYER_AUTH = IS_LIVE ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com'
const TRUELAYER_API = IS_LIVE ? 'https://api.truelayer.com' : 'https://api.truelayer-sandbox.com'

// "providers" collection per country, live mode only. TrueLayer's own doc
// only confirms the uk-ob-all pattern; the rest are inferred from the
// access-method prefix (ob/xs2a/stet) seen on individual provider ids at
// https://auth.truelayer.com/api/providers, not from published docs.
// Verify with a real connection before trusting a newly-added country.
export const COUNTRY_PROVIDERS: Record<string, { label: string; providers: string }> = {
  uk: { label: 'United Kingdom', providers: 'uk-ob-all' },
  es: { label: 'España', providers: 'es-xs2a-all' },
}

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

export function buildAuthorizeUrl(redirectUri: string, clientId: string, scope: string, country?: string): string {
  const authUrl = new URL(`${TRUELAYER_AUTH}/`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  // uk-cs-mock is the sandbox mock bank (country selection doesn't apply -
  // sandbox only simulates a UK mock bank). In live mode, the chosen
  // country picks the providers collection; TRUELAYER_PROVIDERS env var is
  // the fallback when no/unknown country was passed.
  const providers = IS_LIVE
    ? (country && COUNTRY_PROVIDERS[country]?.providers) || process.env.TRUELAYER_PROVIDERS || COUNTRY_PROVIDERS.uk.providers
    : 'uk-cs-mock'
  authUrl.searchParams.set('providers', providers)
  return authUrl.toString()
}

// Builds an Error with the full response body TrueLayer sent back, instead
// of silently falling back to a generic message when error_description
// isn't present (their error shape isn't consistent across endpoints).
async function tlError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text().catch(() => '')
  let detail = text
  try {
    const parsed = JSON.parse(text)
    detail = parsed.error_description || parsed.error || text
  } catch {
    // not JSON - use the raw text as-is
  }
  console.error('[truelayer/client] request failed', {
    url: res.url,
    status: res.status,
    body: text || '<empty response body>',
  })
  return new Error(`${fallback} (HTTP ${res.status}): ${detail || '<empty response body>'}`)
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

  if (!res.ok) throw await tlError(res, 'Token exchange failed')

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

  if (!res.ok) throw await tlError(res, 'Token refresh failed')

  return res.json()
}

export async function revokeToken(accessToken: string): Promise<void> {
  const res = await fetch(`${TRUELAYER_AUTH}/api/delete`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  if (!res.ok) throw await tlError(res, 'Token revocation failed')
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

  if (!res.ok) throw await tlError(res, `API call failed (${path})`)

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
