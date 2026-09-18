-- Fixes for the TrueLayer integration schema (002)
-- Run in Supabase Dashboard → SQL Editor
--
-- 1. truelayer_connections.scopes was inserted by the app code but the
--    column was never created, causing "Could not find the 'scopes' column"
--    on every connection attempt.
-- 2. truelayer_accounts and detected_subscriptions only had a SELECT
--    policy, so RLS silently blocked every INSERT/UPDATE (upsert) from the
--    account sync and subscription detection steps.

ALTER TABLE truelayer_connections
    ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{}';

-- ============================================================
-- truelayer_accounts: allow the owning user to write, not just read
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own truelayer accounts"
    ON truelayer_accounts;

CREATE POLICY "Users can insert own truelayer accounts"
    ON truelayer_accounts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM truelayer_connections
            WHERE truelayer_connections.id = truelayer_accounts.connection_id
              AND truelayer_connections.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own truelayer accounts"
    ON truelayer_accounts;

CREATE POLICY "Users can update own truelayer accounts"
    ON truelayer_accounts
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM truelayer_connections
            WHERE truelayer_connections.id = truelayer_accounts.connection_id
              AND truelayer_connections.user_id = auth.uid()
        )
    );

-- ============================================================
-- detected_subscriptions: allow INSERT (UPDATE already existed)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own detected subscriptions"
    ON detected_subscriptions;

CREATE POLICY "Users can insert own detected subscriptions"
    ON detected_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
