-- Fixes upserts that were silently failing.
-- Run in Supabase Dashboard → SQL Editor
--
-- service.ts upserts truelayer_accounts on (connection_id, true_layer_account_id)
-- and detected_subscriptions on (user_id, merchant_name, billing_cycle), but
-- neither table had a matching UNIQUE constraint. Postgres rejects an upsert
-- whose onConflict target has no unique/exclusion constraint, so every
-- account sync and subscription detection was failing with
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- - silently swallowed by the app code, so nothing ever got saved.

ALTER TABLE truelayer_accounts
    DROP CONSTRAINT IF EXISTS truelayer_accounts_connection_account_unique;

ALTER TABLE truelayer_accounts
    ADD CONSTRAINT truelayer_accounts_connection_account_unique
    UNIQUE (connection_id, true_layer_account_id);

ALTER TABLE detected_subscriptions
    DROP CONSTRAINT IF EXISTS detected_subscriptions_user_merchant_cycle_unique;

ALTER TABLE detected_subscriptions
    ADD CONSTRAINT detected_subscriptions_user_merchant_cycle_unique
    UNIQUE (user_id, merchant_name, billing_cycle);
