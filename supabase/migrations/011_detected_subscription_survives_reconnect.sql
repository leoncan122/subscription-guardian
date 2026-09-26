-- getPendingDetectedSubscriptions only shows is_confirmed=false rows whose
-- connection_id belongs to a currently active bank connection, to avoid
-- resurfacing clutter from banks the user actually abandoned. But
-- reconnecting Open Banking always mints a brand new connection_id, even
-- for the exact same underlying account - so a detection that was
-- confirmed once, then un-confirmed by deleting its subscription (see
-- deleteSubscription/deleteSubscriptions un-confirming their source row),
-- got silently hidden forever unless the same merchant happened to be
-- re-detected under the new connection. was_ever_confirmed lets pending
-- detections that used to be real subscriptions survive that regardless of
-- which connection instance they're still tied to.
-- Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE detected_subscriptions
    ADD COLUMN IF NOT EXISTS was_ever_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: anything currently confirmed, or that has charge history
-- (subscription_charges keeps detected_subscription_id even after the
-- subscription it was linked to gets deleted), was confirmed at some point.
UPDATE detected_subscriptions ds
SET was_ever_confirmed = true
WHERE ds.was_ever_confirmed = false
  AND (
    ds.is_confirmed = true
    OR EXISTS (
        SELECT 1 FROM subscription_charges sc
        WHERE sc.detected_subscription_id = ds.id
    )
  );
