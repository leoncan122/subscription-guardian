-- Salt Edge Open Banking integration, alongside TrueLayer.
-- Run in Supabase Dashboard → SQL Editor
--
-- Salt Edge connections are stored in truelayer_connections too, tagged
-- with aggregator = 'saltedge', so detected_subscriptions.connection_id,
-- the dashboard and the disconnect cleanup keep working unchanged. Their
-- accounts go in truelayer_accounts (true_layer_account_id = Salt Edge
-- account id). Salt Edge has no per-user tokens (calls are authenticated
-- with the app's App-id/Secret), so the token columns stay null.

ALTER TABLE truelayer_connections
    ADD COLUMN IF NOT EXISTS aggregator TEXT NOT NULL DEFAULT 'truelayer',
    ADD COLUMN IF NOT EXISTS saltedge_connection_id TEXT;

-- One row per Salt Edge connection: coming back to the callback (or
-- reconnecting the same bank) updates the row instead of duplicating it.
ALTER TABLE truelayer_connections
    DROP CONSTRAINT IF EXISTS truelayer_connections_saltedge_connection_unique;

ALTER TABLE truelayer_connections
    ADD CONSTRAINT truelayer_connections_saltedge_connection_unique
    UNIQUE (saltedge_connection_id);

-- ============================================================
-- Salt Edge customer per app user
-- Every Salt Edge connection belongs to a Salt Edge "customer"; one is
-- created per user the first time they connect a bank through Salt Edge,
-- with the Supabase user id as its identifier.
-- ============================================================

CREATE TABLE IF NOT EXISTS saltedge_customers (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE saltedge_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own saltedge customer"
    ON saltedge_customers;

CREATE POLICY "Users can view own saltedge customer"
    ON saltedge_customers
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own saltedge customer"
    ON saltedge_customers;

CREATE POLICY "Users can insert own saltedge customer"
    ON saltedge_customers
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
