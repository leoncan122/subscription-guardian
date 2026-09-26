import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush, buildPriceChangeNotification, buildRenewalReminderNotification } from '@/lib/push'
import { advancePastRenewalDate } from '@/lib/renewal'
import { getDaysUntilRenewal } from '@/utils/helpers'
import { BASE_PATH } from '@/lib/constants'
import type { BillingCycle } from '@/types/subscription'

interface PendingPriceChange {
  id: string
  user_id: string
  subscription_id: string
  old_amount: number
  new_amount: number
  currency: string
}

interface RenewalReminder {
  subscriptionId: string
  name: string
  daysUntil: number
}

interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Triggered once a day by Vercel Cron (see vercel.json). Two independent
// checks, one push per user per check:
//  - price changes: subscription_price_changes rows left `pending` by
//    storeCharges (src/lib/subscription-detection.ts) on every bank
//    re-detection.
//  - renewal reminders: any active subscription now exactly 1 or 3 days
//    from renewal_date, advancing that date forward first for anything
//    that's gone stale (see src/lib/renewal.ts).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // ---- Price changes ----

  const { data: pendingChanges, error: changesError } = await supabase
    .from('subscription_price_changes')
    .select('id, user_id, subscription_id, old_amount, new_amount, currency')
    .eq('status', 'pending')

  if (changesError) {
    console.error('[cron/daily-alerts] Failed to load pending price changes:', changesError)
  }

  const changesByUser = new Map<string, PendingPriceChange[]>()
  for (const change of (pendingChanges ?? []) as PendingPriceChange[]) {
    const list = changesByUser.get(change.user_id)
    if (list) list.push(change)
    else changesByUser.set(change.user_id, [change])
  }

  const { data: changedSubs } = await supabase
    .from('subscriptions')
    .select('id, name')
    .in('id', [...new Set((pendingChanges ?? []).map((p) => p.subscription_id))])
  const nameBySubscriptionId = new Map((changedSubs ?? []).map((s) => [s.id, s.name as string]))

  // ---- Renewal reminders ----

  const { data: activeSubs, error: activeSubsError } = await supabase
    .from('subscriptions')
    .select('id, user_id, name, renewal_date, billing_cycle')
    .eq('active', true)

  if (activeSubsError) {
    console.error('[cron/daily-alerts] Failed to load active subscriptions:', activeSubsError)
  }

  const staleRenewalDates: { id: string; renewal_date: string }[] = []
  const remindersByUser = new Map<string, RenewalReminder[]>()

  for (const sub of activeSubs ?? []) {
    const cycle = (sub.billing_cycle as BillingCycle) ?? 'monthly'
    const currentRenewalDate = advancePastRenewalDate(sub.renewal_date, cycle)
    if (currentRenewalDate !== sub.renewal_date) {
      staleRenewalDates.push({ id: sub.id, renewal_date: currentRenewalDate })
    }

    const days = getDaysUntilRenewal(currentRenewalDate)
    if (days === 1 || days === 3) {
      const reminder: RenewalReminder = { subscriptionId: sub.id, name: sub.name, daysUntil: days }
      const list = remindersByUser.get(sub.user_id)
      if (list) list.push(reminder)
      else remindersByUser.set(sub.user_id, [reminder])
    }
  }

  if (staleRenewalDates.length > 0) {
    const { error: advanceError } = await supabase
      .from('subscriptions')
      .upsert(staleRenewalDates, { onConflict: 'id' })
    if (advanceError) console.error('[cron/daily-alerts] Failed to advance stale renewal dates:', advanceError)
  }

  // ---- Deliver ----

  const userIds = [...new Set([...changesByUser.keys(), ...remindersByUser.keys()])]
  if (userIds.length === 0) {
    return NextResponse.json({ sent: 0, usersNotified: 0 })
  }

  const [{ data: settingsRows }, { data: pushRows }] = await Promise.all([
    supabase.from('user_settings').select('user_id, notifications_enabled, locale').in('user_id', userIds),
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ])

  const settingsByUser = new Map((settingsRows ?? []).map((s) => [s.user_id, s]))
  const pushTargetsByUser = new Map<string, PushSubscriptionRow[]>()
  for (const row of (pushRows ?? []) as PushSubscriptionRow[]) {
    const list = pushTargetsByUser.get(row.user_id)
    if (list) list.push(row)
    else pushTargetsByUser.set(row.user_id, [row])
  }

  let sent = 0
  const usersNotified = new Set<string>()
  const staleSubscriptionIds: string[] = []

  for (const userId of userIds) {
    const settings = settingsByUser.get(userId)
    if (!settings || settings.notifications_enabled === false) continue

    const targets = pushTargetsByUser.get(userId) ?? []
    if (targets.length === 0) continue

    const notifications: { title: string; body: string; url: string; tag: string }[] = []

    const priceChanges = changesByUser.get(userId)
    if (priceChanges && priceChanges.length > 0) {
      const notification = buildPriceChangeNotification(
        settings.locale,
        priceChanges.map((c) => ({
          name: nameBySubscriptionId.get(c.subscription_id) ?? '',
          oldAmount: c.old_amount,
          newAmount: c.new_amount,
          currency: c.currency,
        }))
      )
      const url = priceChanges.length === 1
        ? `${BASE_PATH}/dashboard?subscription=${priceChanges[0].subscription_id}`
        : `${BASE_PATH}/dashboard`
      notifications.push({ ...notification, url, tag: 'price-change' })
    }

    const reminders = remindersByUser.get(userId)
    if (reminders && reminders.length > 0) {
      const notification = buildRenewalReminderNotification(settings.locale, reminders)
      const url = reminders.length === 1
        ? `${BASE_PATH}/dashboard?subscription=${reminders[0].subscriptionId}`
        : `${BASE_PATH}/dashboard`
      notifications.push({ ...notification, url, tag: 'renewal-reminder' })
    }

    for (const notification of notifications) {
      for (const target of targets) {
        const result = await sendPush(
          { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth },
          notification
        )
        if (result === 'sent') {
          sent++
          usersNotified.add(userId)
        } else if (result === 'gone') {
          staleSubscriptionIds.push(target.id)
        }
      }
    }
  }

  if (staleSubscriptionIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleSubscriptionIds)
    if (deleteError) console.error('[cron/daily-alerts] Failed to remove stale push subscriptions:', deleteError)
  }

  return NextResponse.json({
    sent,
    usersNotified: usersNotified.size,
    renewalDatesAdvanced: staleRenewalDates.length,
    staleRemoved: staleSubscriptionIds.length,
  })
}
