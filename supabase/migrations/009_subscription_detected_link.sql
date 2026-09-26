-- Link confirmed subscriptions back to the detected row they came from.
-- Needed so re-detections (and the subscription detail view) can find a
-- confirmed subscription's real charge history in subscription_charges.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS detected_subscription_id UUID
        REFERENCES detected_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_detected_subscription
    ON subscriptions(detected_subscription_id);

-- Backfill existing confirmed bank subscriptions, matching by name only
-- where it's unambiguous (exactly one subscription and one confirmed
-- detected row share that name for the user) - anything else is left
-- unlinked rather than guessed. Safe to re-run: only touches rows that are
-- still unlinked.
WITH unique_subs AS (
    SELECT user_id, name
    FROM subscriptions
    WHERE payment_method = 'Bank Account'
    GROUP BY user_id, name
    HAVING COUNT(*) = 1
),
unique_detected AS (
    SELECT user_id, merchant_name, id AS detected_id
    FROM detected_subscriptions
    WHERE is_confirmed = true
    GROUP BY user_id, merchant_name, id
),
unique_detected_counts AS (
    SELECT user_id, merchant_name
    FROM detected_subscriptions
    WHERE is_confirmed = true
    GROUP BY user_id, merchant_name
    HAVING COUNT(*) = 1
)
UPDATE subscriptions s
SET detected_subscription_id = ud.detected_id
FROM unique_subs us
JOIN unique_detected_counts udc
    ON udc.user_id = us.user_id AND udc.merchant_name = us.name
JOIN unique_detected ud
    ON ud.user_id = us.user_id AND ud.merchant_name = us.name
WHERE s.user_id = us.user_id
    AND s.name = us.name
    AND s.payment_method = 'Bank Account'
    AND s.detected_subscription_id IS NULL;
