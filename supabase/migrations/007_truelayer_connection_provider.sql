-- Which bank a TrueLayer connection belongs to, so the dashboard can show
-- "BBVA" instead of a generic "Bank Connected". Filled from TrueLayer's
-- /me provider on connect; existing rows are backfilled from the accounts
-- endpoint the next time the connection is synced or checked.
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE truelayer_connections
    ADD COLUMN IF NOT EXISTS provider_id TEXT,     -- e.g. 'ob-monzo', 'xs2a-bbva'
    ADD COLUMN IF NOT EXISTS provider_name TEXT;   -- display name, e.g. 'Monzo'
