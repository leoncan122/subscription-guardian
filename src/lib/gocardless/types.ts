// ==================== GoCardless DB Types ====================
// GoCardless API response types live in src/lib/gocardless/client.ts (GC* types).

export interface GoCardlessConnection {
  id: string
  user_id: string
  requisition_id: string
  agreement_id: string | null
  institution_id: string
  reference: string
  status: 'pending' | 'active' | 'revoked' | 'expired'
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface GoCardlessAccountDB {
  id: string
  connection_id: string
  gocardless_account_id: string
  account_label: string | null
  iban: string | null
  currency: string | null
  balance_amount: number | null
  balance_currency: string | null
  balance_type: string
  last_fetched_at: string
}
