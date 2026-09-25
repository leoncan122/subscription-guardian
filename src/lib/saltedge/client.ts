// Salt Edge Account Information API v6 client - Server-side only
// Reference: https://docs.saltedge.com/v6/api_reference
//
// Unlike TrueLayer there is no per-user OAuth token: every call is
// authenticated with the app's own App-id/Secret, and the user's bank access
// is a Salt Edge "connection" that belongs to a Salt Edge "customer".
// There is a single API host; whether real banks are available depends on
// the Salt Edge app's status (a pending/test app only sees fake providers).
const SALTEDGE_API = 'https://www.saltedge.com/api/v6'

// SALTEDGE_ENV=live shows real banks only. Anything else also offers Salt
// Edge's fake providers (country "XF") and the banks' own sandboxes, which is
// all a test app can connect to.
export const IS_LIVE = process.env.SALTEDGE_ENV === 'live'

export interface SECustomer {
  customer_id: string
  identifier: string
  created_at: string
}

export interface SEConnectSession {
  connect_url: string
  expires_at: string
  customer_id: string
}

export interface SEConnection {
  id: string
  customer_id: string
  provider_code: string
  provider_name: string
  country_code: string
  // active | inactive | disabled
  status: string
  last_consent_id: string | null
  last_attempt?: {
    id: string
    finished: boolean
    success_at: string | null
    fail_at: string | null
  }
}

export interface SEAccount {
  id: string
  connection_id: string
  name: string
  nature: string
  balance: number
  currency_code: string
}

export interface SETransaction {
  id: string
  account_id: string
  made_on: string
  // negative for money going out
  amount: number
  currency_code: string
  description: string
  // Not returned by v6 /transactions (at least for fake providers) - kept
  // optional in case a provider/categorization setting fills it in.
  category?: string
  // normal | fee | transfer
  mode: string
  // posted | pending
  status: string
  duplicated?: boolean
  extra?: {
    payee?: string
    merchant_id?: string
    additional?: string
    [key: string]: unknown
  }
}

interface SEEnvelope<T> {
  data: T
  meta?: { next_id: string | null; next_page: string | null }
}

// Error from a Salt Edge call. `errorClass` is Salt Edge's error class
// (e.g. "ConnectionNotFound", "DuplicatedCustomer"), for callers that branch on it.
export class SEError extends Error {
  constructor(message: string, readonly status: number, readonly errorClass?: string) {
    super(message)
    this.name = 'SEError'
  }
}

async function seError(res: Response, fallback: string): Promise<SEError> {
  const text = await res.text().catch(() => '')
  let detail = text
  let errorClass: string | undefined
  try {
    const parsed = JSON.parse(text)
    errorClass = parsed.error?.class
    detail = parsed.error?.message || text
  } catch {
    // not JSON - use the raw text as-is
  }
  console.error('[saltedge/client] request failed', {
    url: res.url,
    status: res.status,
    body: text || '<empty response body>',
  })
  return new SEError(`${fallback} (HTTP ${res.status}${errorClass ? ` ${errorClass}` : ''}): ${detail || '<empty response body>'}`, res.status, errorClass)
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<SEEnvelope<T>> {
  const res = await fetch(`${SALTEDGE_API}${path}`, {
    method,
    headers: {
      'App-id': process.env.SALTEDGE_APP_ID || '',
      'Secret': process.env.SALTEDGE_SECRET || '',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify({ data: body }),
  })

  if (!res.ok) throw await seError(res, `${method} ${path.split('?')[0]} failed`)

  return res.json()
}

// Follows the from_id cursor until every page has been read.
async function listAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = []
  let fromId: string | null = null
  do {
    const query = new URLSearchParams(params)
    if (fromId) query.set('from_id', fromId)
    const page: SEEnvelope<T[]> = await request<T[]>('GET', `${path}?${query}`)
    all.push(...page.data)
    fromId = page.meta?.next_id ?? null
  } while (fromId)
  return all
}

// ==================== Customers ====================

export async function createCustomer(identifier: string): Promise<SECustomer> {
  const res = await request<SECustomer>('POST', '/customers', { identifier })
  return res.data
}

// There is no lookup by identifier, so this pages through every customer.
// Only needed to recover when a customer exists in Salt Edge but we lost
// its id (createCustomer failed with DuplicatedCustomer).
export async function findCustomerByIdentifier(identifier: string): Promise<SECustomer | null> {
  const customers = await listAll<SECustomer>('/customers', {})
  return customers.find(c => c.identifier === identifier) ?? null
}

// ==================== Connections ====================

export interface ConnectSessionOptions {
  customerId: string
  returnTo: string
  // ISO 3166-1 alpha-2, e.g. 'ES', 'GB'
  country?: string
  // earliest transaction date to fetch (YYYY-MM-DD)
  fromDate: string
  locale?: string
}

// Starts the Salt Edge Connect widget: the user is sent to connect_url,
// picks their bank and authorizes there, and comes back to returnTo with
// ?connection_id=... (or ?error_class=... when it failed).
export async function createConnectSession(opts: ConnectSessionOptions): Promise<SEConnectSession> {
  const countries = opts.country ? [opts.country] : []
  if (!IS_LIVE) countries.push('XF')

  const res = await request<SEConnectSession>('POST', '/connections/connect', {
    customer_id: opts.customerId,
    consent: {
      scopes: ['accounts', 'transactions'],
      from_date: opts.fromDate,
    },
    attempt: {
      fetch_scopes: ['accounts', 'balance', 'transactions'],
      fetch_from_date: opts.fromDate,
      return_to: opts.returnTo,
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
    widget: {
      // Only come back once transactions are fetched, so detection can run
      // straight away in the callback.
      wait_all_transactions: true,
      ...(countries.length ? { allowed_countries: countries, popular_providers_country: countries[0] } : {}),
    },
    provider: {
      include_sandboxes: !IS_LIVE,
    },
    return_connection_id: true,
    return_error_class: true,
    categorization: 'personal',
    // Salt Edge refreshes the data in the background, so later detections
    // see new transactions without the user reconnecting.
    automatic_refresh: true,
  })
  return res.data
}

export async function getConnection(connectionId: string): Promise<SEConnection> {
  const res = await request<SEConnection>('GET', `/connections/${encodeURIComponent(connectionId)}`)
  return res.data
}

export async function removeConnection(connectionId: string): Promise<void> {
  await request('DELETE', `/connections/${encodeURIComponent(connectionId)}`)
}

// ==================== Data ====================

export async function getAccounts(customerId: string, connectionId: string): Promise<SEAccount[]> {
  return listAll<SEAccount>('/accounts', { customer_id: customerId, connection_id: connectionId })
}

export async function getTransactions(connectionId: string, accountId: string): Promise<SETransaction[]> {
  return listAll<SETransaction>('/transactions', { connection_id: connectionId, account_id: accountId })
}
