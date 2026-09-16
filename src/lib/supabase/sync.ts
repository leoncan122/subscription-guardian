import { getSubscriptions, addSubscription as addSupaSubscription, updateSubscription, deleteSubscription } from '@/lib/supabase/subscriptions'
import { Subscription } from '@/types/subscription'

// Sync functions that bridge local IndexedDB with Supabase
export async function syncToCloud(): Promise<{ success: boolean; synced: number }> {
  const { data: { user } } = await (await import('@/lib/supabase/client')).createClient().auth.getUser()
  if (!user) return { success: false, synced: 0 }

  // Get local subscriptions from IndexedDB
  const localSubscriptions = await getLocalSubscriptions()

  if (localSubscriptions.length === 0) return { success: true, synced: 0 }

  let synced = 0
  for (const sub of localSubscriptions) {
    await addSupaSubscription({
      ...sub,
      userId: user.id,
    })
    synced++
  }

  // Clear local after successful sync
  await clearLocalSubscriptions()

  return { success: true, synced }
}

export async function syncFromCloud(): Promise<Subscription[]> {
  const subscriptions = await getSubscriptions()

  // Store in IndexedDB
  await saveLocalSubscriptions(subscriptions)

  return subscriptions
}

// IndexedDB helpers (simplified - in production, use the existing db utilities)
async function getLocalSubscriptions(): Promise<any[]> {
  // Read from IndexedDB using existing utilities
  const { openDB } = await import('idb')
  const db = await openDB('subscription-guardian', 1)
  const store = db.transaction('subscriptions', 'readonly').store
  return (await store.getAll()) || []
}

async function saveLocalSubscriptions(subscriptions: any[]): Promise<void> {
  const { openDB } = await import('idb')
  const db = await openDB('subscription-guardian', 1)
  const tx = db.transaction('subscriptions', 'readwrite')
  await tx.store.clear()
  for (const sub of subscriptions) {
    await tx.store.put(sub)
  }
  await tx.done
}

async function clearLocalSubscriptions(): Promise<void> {
  const { openDB } = await import('idb')
  const db = await openDB('subscription-guardian', 1)
  const tx = db.transaction('subscriptions', 'readwrite')
  await tx.store.clear()
  await tx.done
}
