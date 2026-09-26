-- Browser push subscriptions, one row per (user, device/browser). Written
-- by src/app/api/push/subscribe/route.ts when the client subscribes (see
-- subscribeToPush in src/utils/push-notifications.ts), read by the daily
-- cron (src/app/api/cron/price-change-alerts/route.ts) via the service-role
-- client, which bypasses RLS - the cron has no single user session to
-- authenticate as, since it notifies every user in one run.
-- Run in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- An endpoint identifies one browser/device subscription regardless of
-- which user it gets attached to - re-subscribing (e.g. after the user
-- logs out and back in on the same device) must update the row, not
-- duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
    ON push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions"
    ON push_subscriptions;

CREATE POLICY "Users can view own push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions"
    ON push_subscriptions;

CREATE POLICY "Users can insert own push subscriptions"
    ON push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions"
    ON push_subscriptions;

CREATE POLICY "Users can update own push subscriptions"
    ON push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions"
    ON push_subscriptions;

CREATE POLICY "Users can delete own push subscriptions"
    ON push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);
