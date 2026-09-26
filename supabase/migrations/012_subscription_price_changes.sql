-- Staging table for detected price changes on already-confirmed
-- subscriptions, mirroring the detected_subscriptions confirm/dismiss
-- pattern: a re-detection run finds the bank now charges a different
-- amount than subscriptions.amount, and this row surfaces that for the
-- user to accept (adopt the new price) or dismiss (stop nagging about
-- this specific amount, but re-flag if it changes again).
-- Populated by src/lib/subscription-detection.ts (storeCharges), shared by
-- both TrueLayer and Salt Edge detection.
-- Run in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS subscription_price_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    old_amount NUMERIC(10, 2) NOT NULL,
    new_amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed')),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One live row per subscription: a further price change updates it in
-- place (see upsert logic in subscription-detection.ts) instead of piling
-- up history here - subscription_charges already keeps the real charge
-- history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_price_changes_subscription
    ON subscription_price_changes(subscription_id);

ALTER TABLE subscription_price_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own price changes"
    ON subscription_price_changes;

CREATE POLICY "Users can view own price changes"
    ON subscription_price_changes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own price changes"
    ON subscription_price_changes;

CREATE POLICY "Users can insert own price changes"
    ON subscription_price_changes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own price changes"
    ON subscription_price_changes;

CREATE POLICY "Users can update own price changes"
    ON subscription_price_changes FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own price changes"
    ON subscription_price_changes;

CREATE POLICY "Users can delete own price changes"
    ON subscription_price_changes FOR DELETE
    USING (auth.uid() = user_id);
