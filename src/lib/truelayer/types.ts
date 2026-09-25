// ==================== TrueLayer DB Types ====================
// TrueLayer API response types live in src/lib/truelayer/client.ts (TL* types).
//
// truelayer_connections/truelayer_accounts also hold Salt Edge connections
// (aggregator = 'saltedge'), so detected subscriptions, the dashboard and the
// disconnect cleanup work the same whichever aggregator connected the bank.
// For those rows the TrueLayer token columns stay null.

export type BankAggregator = 'truelayer' | 'saltedge'

export interface TrueLayerConnection {
  id: string
  user_id: string
  aggregator: BankAggregator
  // TrueLayer: credentials_id. Salt Edge: the connection's last consent id.
  consent_id: string
  // Salt Edge connection id (null for TrueLayer connections)
  saltedge_connection_id: string | null
  scopes: string[]
  access_token: string | null
  refresh_token: string | null
  access_token_expires_at: string | null
  status: 'pending' | 'active' | 'revoked' | 'expired'
  provider_id: string | null
  provider_name: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface TrueLayerAccountDB {
  id: string
  connection_id: string
  // the aggregator's account id (Salt Edge account id for Salt Edge rows)
  true_layer_account_id: string
  account_label: string | null
  currency: string | null
  balance_amount: number | null
  balance_currency: string | null
  balance_type: string
  last_fetched_at: string
}

export interface DetectedSubscription {
  id: string
  user_id: string
  connection_id: string
  merchant_name: string
  amount: number
  currency: string
  billing_cycle: string
  first_seen: string | null
  last_seen: string | null
  occurrence_count: number
  is_confirmed: boolean
  category: string
}

export interface SyncResult {
  accounts: number
  transactions: number
  subscriptionsDetected: number
}
