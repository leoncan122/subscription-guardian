-- Allows dismissing a detected subscription (delete it outright).
-- Run in Supabase Dashboard → SQL Editor

DROP POLICY IF EXISTS "Users can delete own detected subscriptions"
    ON detected_subscriptions;

CREATE POLICY "Users can delete own detected subscriptions"
    ON detected_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);
