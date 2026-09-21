-- GoCardless Bank Account Data integration (alternative to TrueLayer)
-- Run in Supabase Dashboard → SQL Editor
--
-- GoCardless Bank Account Data uses an app-level secret_id/secret_key pair
-- (env vars, never stored in the DB) to mint access/refresh JWTs - unlike
-- TrueLayer's per-connection OAuth tokens, so gocardless_connections stores
-- the requisition/agreement identifiers for the user's bank consent, not an
-- access token.

-- ============================================================
-- GoCardless connections (one per bank requisition/consent)
-- ============================================================

CREATE TABLE IF NOT EXISTS gocardless_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requisition_id TEXT NOT NULL UNIQUE,
    agreement_id TEXT,
    institution_id TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Bank account metadata from GoCardless
-- ============================================================

CREATE TABLE IF NOT EXISTS gocardless_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL
        REFERENCES gocardless_connections(id)
        ON DELETE CASCADE,
    gocardless_account_id TEXT NOT NULL,
    account_label TEXT,
    iban TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    balance_amount NUMERIC(12, 2),
    balance_currency TEXT,
    balance_type TEXT DEFAULT 'interimAvailable',
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, gocardless_account_id)
);

-- ============================================================
-- detected_subscriptions: allow rows sourced from either provider
-- ============================================================
-- connection_id previously had a hard FK to truelayer_connections only.
-- Drop it (rows can now point at either truelayer_connections or
-- gocardless_connections) and tag each row with its source provider.

ALTER TABLE detected_subscriptions
    DROP CONSTRAINT IF EXISTS detected_subscriptions_connection_id_fkey;

ALTER TABLE detected_subscriptions
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'truelayer';

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gocardless_connections_user
    ON gocardless_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_gocardless_connections_status
    ON gocardless_connections(status);

CREATE INDEX IF NOT EXISTS idx_gocardless_accounts_connection
    ON gocardless_accounts(connection_id);

-- ============================================================
-- Triggers
-- Uses the existing update_updated_at_column() function from 001.
-- ============================================================

DROP TRIGGER IF EXISTS update_gocardless_connections_updated_at
    ON gocardless_connections;

CREATE TRIGGER update_gocardless_connections_updated_at
    BEFORE UPDATE ON gocardless_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_gocardless_accounts_updated_at
    ON gocardless_accounts;

CREATE TRIGGER update_gocardless_accounts_updated_at
    BEFORE UPDATE ON gocardless_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- Includes INSERT/UPDATE policies (and unique constraints above matching
-- the app's upsert onConflict targets) from the start - migrations 003/004
-- had to patch these in after the fact for the TrueLayer tables.
-- ============================================================

ALTER TABLE gocardless_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gocardless connections"
    ON gocardless_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gocardless connections"
    ON gocardless_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gocardless connections"
    ON gocardless_connections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gocardless connections"
    ON gocardless_connections FOR DELETE
    USING (auth.uid() = user_id);

ALTER TABLE gocardless_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gocardless accounts"
    ON gocardless_accounts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM gocardless_connections
            WHERE gocardless_connections.id = gocardless_accounts.connection_id
              AND gocardless_connections.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own gocardless accounts"
    ON gocardless_accounts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM gocardless_connections
            WHERE gocardless_connections.id = gocardless_accounts.connection_id
              AND gocardless_connections.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own gocardless accounts"
    ON gocardless_accounts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM gocardless_connections
            WHERE gocardless_connections.id = gocardless_accounts.connection_id
              AND gocardless_connections.user_id = auth.uid()
        )
    );
