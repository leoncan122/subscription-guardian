// ==================== TrueLayer DB Types ====================
// TrueLayer API response types live in src/lib/truelayer/client.ts (TL* types).

export interface TrueLayerConnection {
  id: string
  user_id: string
  consent_id: string
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
