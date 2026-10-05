-- Cancellation date behind the history page's "how much have I saved"
-- figure. `active` alone only says a subscription is cancelled, not since
-- when, so accumulated savings ("4 months without Netflix") can't be
-- derived from it.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE;

-- Backfill for subscriptions cancelled before this column existed:
-- updated_at is the best available approximation (it was touched by the
-- toggle that deactivated them). Only fills rows already inactive, and
-- never overwrites a value set by the app.
UPDATE subscriptions
   SET canceled_at = updated_at
 WHERE active = false
   AND canceled_at IS NULL;

-- The history page filters by user + active, then sorts by cancellation.
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active
    ON subscriptions(user_id, active);
