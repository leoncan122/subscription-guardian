import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush, buildPriceChangeNotification } from '@/lib/push'
import { BASE_PATH } from '@/lib/constants'

interface PendingPriceChange {
  id: string
  user_id: string
  subscription_id: string
  old_amount: number
  new_amount: number
  currency: string
}

interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Triggered once a day by Vercel Cron (see vercel.json). Summarizes every
// pending subscription_price_changes row into one push per affected user -
// storeCharges (src/lib/subscription-detection.ts) is what actually creates
// those rows, on every bank re-detection.
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

  const { data: pending, error } = await supabase
    .from('subscription_price_changes')
    .select('id, user_id, subscription_id, old_amount, new_amount, currency')
    .eq('status', 'pending')

  if (error) {
    console.error('[cron/price-change-alerts] Failed to load pending price changes:', error)
    return NextResponse.json({ error: 'Failed to load price changes' }, { status: 500 })
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ sent: 0, usersNotified: 0 })
  }

  const changesByUser = new Map<string, PendingPriceChange[]>()
  for (const change of pending as PendingPriceChange[]) {
    const list = changesByUser.get(change.user_id)
    if (list) list.push(change)
    else changesByUser.set(change.user_id, [change])
  }
  const userIds = [...changesByUser.keys()]

  const [{ data: subs }, { data: settingsRows }, { data: pushRows }] = await Promise.all([
    supabase.from('subscriptions').select('id, name').in(
      'id',
      [...new Set(pending.map((p) => p.subscription_id))]
    ),
    supabase.from('user_settings').select('user_id, notifications_enabled, locale').in('user_id', userIds),
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ])

  const nameBySubscriptionId = new Map((subs ?? []).map((s) => [s.id, s.name as string]))
  const settingsByUser = new Map((settingsRows ?? []).map((s) => [s.user_id, s]))

  const pushTargetsByUser = new Map<string, PushSubscriptionRow[]>()
  for (const row of (pushRows ?? []) as PushSubscriptionRow[]) {
    const list = pushTargetsByUser.get(row.user_id)
    if (list) list.push(row)
    else pushTargetsByUser.set(row.user_id, [row])
  }

  let sent = 0
  let usersNotified = 0
  const staleSubscriptionIds: string[] = []

  for (const [userId, changes] of changesByUser) {
    const settings = settingsByUser.get(userId)
    if (!settings || settings.notifications_enabled === false) continue

    const targets = pushTargetsByUser.get(userId) ?? []
    if (targets.length === 0) continue

    const notification = buildPriceChangeNotification(
      settings.locale,
      changes.map((c) => ({
        name: nameBySubscriptionId.get(c.subscription_id) ?? '',
        oldAmount: c.old_amount,
        newAmount: c.new_amount,
        currency: c.currency,
      }))
    )
    // A single change deep-links straight into that subscription's detail
    // modal (see src/app/dashboard/page.tsx reading ?subscription=); several
    // at once just open the dashboard, where the price-changes banner lists
    // them all.
    const url = changes.length === 1
      ? `${BASE_PATH}/dashboard?subscription=${changes[0].subscription_id}`
      : `${BASE_PATH}/dashboard`

    let deliveredToUser = false
    for (const target of targets) {
      const result = await sendPush(
        { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth },
        { title: notification.title, body: notification.body, url }
      )
      if (result === 'sent') {
        sent++
        deliveredToUser = true
      } else if (result === 'gone') {
        staleSubscriptionIds.push(target.id)
      }
    }
    if (deliveredToUser) usersNotified++
  }

  if (staleSubscriptionIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleSubscriptionIds)
    if (deleteError) console.error('[cron/price-change-alerts] Failed to remove stale push subscriptions:', deleteError)
  }

  return NextResponse.json({ sent, usersNotified, staleRemoved: staleSubscriptionIds.length })
}
