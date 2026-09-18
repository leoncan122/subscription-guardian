-- TrueLayer Open Banking integration
-- Run in Supabase Dashboard → SQL Editor

-- ============================================================
-- TrueLayer connections
-- ============================================================

CREATE TABLE IF NOT EXISTS truelayer_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consent_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending',
    accounts JSONB DEFAULT '[]'::jsonb,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Bank account metadata from TrueLayer
-- ============================================================

CREATE TABLE IF NOT EXISTS truelayer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL
        REFERENCES truelayer_connections(id)
        ON DELETE CASCADE,
    true_layer_account_id TEXT NOT NULL,
    account_label TEXT,
    currency TEXT NOT NULL DEFAULT 'GBP',
    balance_amount NUMERIC(12, 2),
    balance_currency TEXT,
    balance_type TEXT DEFAULT 'current',
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Detected subscriptions from transaction analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS detected_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES truelayer_connections(id),
    merchant_name TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    first_seen DATE,
    last_seen DATE,
    occurrence_count INT DEFAULT 1,
    is_confirmed BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'other',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_truelayer_connections_user
    ON truelayer_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_truelayer_connections_status
    ON truelayer_connections(status);

CREATE INDEX IF NOT EXISTS idx_truelayer_accounts_connection
    ON truelayer_accounts(connection_id);

CREATE INDEX IF NOT EXISTS idx_detected_subscriptions_user
    ON detected_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_detected_subscriptions_merchant
    ON detected_subscriptions(merchant_name);

-- ============================================================
-- Triggers
-- Uses the existing update_updated_at_column() function from 001.
-- ============================================================

DROP TRIGGER IF EXISTS update_truelayer_connections_updated_at
    ON truelayer_connections;

CREATE TRIGGER update_truelayer_connections_updated_at
    BEFORE UPDATE ON truelayer_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_truelayer_accounts_updated_at
    ON truelayer_accounts;

CREATE TRIGGER update_truelayer_accounts_updated_at
    BEFORE UPDATE ON truelayer_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_detected_subscriptions_updated_at
    ON detected_subscriptions;

CREATE TRIGGER update_detected_subscriptions_updated_at
    BEFORE UPDATE ON detected_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE truelayer_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own truelayer connections"
    ON truelayer_connections;

CREATE POLICY "Users can view own truelayer connections"
    ON truelayer_connections
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own truelayer connections"
    ON truelayer_connections;

CREATE POLICY "Users can insert own truelayer connections"
    ON truelayer_connections
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own truelayer connections"
    ON truelayer_connections;

CREATE POLICY "Users can update own truelayer connections"
    ON truelayer_connections
    FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own truelayer connections"
    ON truelayer_connections;

CREATE POLICY "Users can delete own truelayer connections"
    ON truelayer_connections
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- TrueLayer accounts RLS
-- ============================================================

ALTER TABLE truelayer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own truelayer accounts"
    ON truelayer_accounts;

CREATE POLICY "Users can view own truelayer accounts"
    ON truelayer_accounts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM truelayer_connections
            WHERE truelayer_connections.id = truelayer_accounts.connection_id
              AND truelayer_connections.user_id = auth.uid()
        )
    );

-- ============================================================
-- Detected subscriptions RLS
-- ============================================================

ALTER TABLE detected_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own detected subscriptions"
    ON detected_subscriptions;

CREATE POLICY "Users can view own detected subscriptions"
    ON detected_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own detected subscriptions"
    ON detected_subscriptions;

CREATE POLICY "Users can update own detected subscriptions"
    ON detected_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);
