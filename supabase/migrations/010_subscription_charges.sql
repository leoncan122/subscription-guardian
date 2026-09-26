-- Per-charge history behind the subscription detail view: one row per
-- individual bank charge, kept even after a subscription is confirmed or
-- its bank disconnected. Populated by detectSubscriptions (TrueLayer and
-- Salt Edge) via storeDetectedSubscriptions in src/lib/subscription-detection.ts.
-- Run in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS subscription_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    detected_subscription_id UUID NOT NULL REFERENCES detected_subscriptions(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL,
    charged_on DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Re-detecting the same period must not duplicate charges already stored.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_charges_unique
    ON subscription_charges(detected_subscription_id, charged_on, amount);

CREATE INDEX IF NOT EXISTS idx_subscription_charges_subscription
    ON subscription_charges(subscription_id);

ALTER TABLE subscription_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription charges"
    ON subscription_charges;

CREATE POLICY "Users can view own subscription charges"
    ON subscription_charges FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscription charges"
    ON subscription_charges;

CREATE POLICY "Users can insert own subscription charges"
    ON subscription_charges FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription charges"
    ON subscription_charges;

CREATE POLICY "Users can update own subscription charges"
    ON subscription_charges FOR UPDATE
    USING (auth.uid() = user_id);
