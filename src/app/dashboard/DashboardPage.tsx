'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Subscription } from '@/types/subscription'
import { getTotalMonthly, getUpcomingSubscriptions, getNextRenewal, getDaysUntilRenewal } from '@/utils/helpers'
import { SubscriptionCard } from '@/components/SubscriptionCard'
import { Header, TabBar } from '@/components/Header'
import { AddSubscriptionForm } from '@/components/AddSubscriptionForm'
import { SummaryCard, UpcomingCard } from '@/components/SummaryCard'
import { sendPushNotification } from '@/utils/push-notifications'
import { type RealtimeChannel } from '@supabase/supabase-js'

const supabase = createClient()

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  const loadSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user?.id!)
        .order('renewalDate', { ascending: true })

      if (error) throw error
      setSubscriptions(data || [])
    } catch (error) {
      console.error('Failed to load subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadSubscriptions()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('subscriptions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user?.id}`,
        },
        (payload) => {
          console.log('Change received!', payload)
          loadSubscriptions()
        }
      )
      .subscribe()

    setChannel(channel)

    return () => {
      channel.unsubscribe()
    }
  }, [loadSubscriptions, user?.id])

  const handleAdd = async (sub: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .insert({ ...sub, user_id: user?.id })

      if (error) throw error
      await loadSubscriptions()
      setShowAddForm(false)
    } catch (error) {
      console.error('Failed to add subscription:', error)
    }
  }

  const handleEdit = async (id: string, updates: Partial<Subscription>) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      await loadSubscriptions()
    } catch (error) {
      console.error('Failed to update subscription:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id)

      if (error) throw error
      await loadSubscriptions()
    } catch (error) {
      console.error('Failed to delete subscription:', error)
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ active })
        .eq('id', id)

      if (error) throw error
      await loadSubscriptions()
    } catch (error) {
      console.error('Failed to toggle subscription:', error)
    }
  }

  const handleDisconnectBank = async () => {
    try {
      const { error } = await supabase
        .from('bank_connections')
        .delete()
        .eq('user_id', user?.id!)
        .eq('status', 'active')

      if (error) throw error
    } catch (error) {
      console.error('Failed to disconnect bank:', error)
    }
  }

  const totalMonthly = getTotalMonthly(subscriptions)
  const upcoming = getUpcomingSubscriptions(subscriptions, 7)
  const nextRenewal = getNextRenewal(subscriptions)

  const activeCount = subscriptions.filter((s) => s.active).length
  const totalAnnual = totalMonthly * 12

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <Header onLogout={signOut} />

      <main className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === 'dashboard' ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                title="Monthly"
                amount={totalMonthly}
                subtitle={`${activeCount} active sub`}
                icon="💰"
              />
              <SummaryCard
                title="Yearly"
                amount={totalAnnual}
                subtitle="Total estimate"
                icon="📈"
              />
            </div>

            {/* Next Renewal */}
            {nextRenewal && (
              <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl p-4">
                <p className="text-sm text-blue-100">Next Renewal</p>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {nextRenewal.name}
                    </h3>
                    <p className="text-sm text-blue-100">
                      {nextRenewal.currency === 'USD'
                        ? `$${nextRenewal.amount.toFixed(2)}`
                        : `${nextRenewal.currency} ${nextRenewal.amount.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">
                      {new Date(nextRenewal.renewalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-blue-100">
                      {getDaysUntilRenewal(nextRenewal.renewalDate) <= 0
                        ? 'Due today'
                        : getDaysUntilRenewal(nextRenewal.renewalDate) === 1
                        ? 'Tomorrow'
                        : `${getDaysUntilRenewal(nextRenewal.renewalDate)} days`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Bank Connection Status */}
            <BankConnectionCard userId={user?.id!} onDisconnect={handleDisconnectBank} />

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Upcoming in 7 days
                </h3>
                <div className="space-y-2">
                  {upcoming.map((sub) => (
                    <UpcomingCard
                      key={sub.id}
                      name={sub.name}
                      amount={sub.amount}
                      days={getDaysUntilRenewal(sub.renewalDate)}
                      billingCycle={sub.billingCycle}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Subscriptions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">
                  All Subscriptions
                </h3>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-blue-400 text-sm font-medium hover:text-blue-300"
                >
                  {showAddForm ? 'Cancel' : '+ Add New'}
                </button>
              </div>

              {showAddForm && (
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                  <AddSubscriptionForm
                    onSubmit={handleAdd}
                    onClose={() => setShowAddForm(false)}
                  />
                </div>
              )}

              <div className="space-y-2">
                {subscriptions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-2">📋</p>
                    <p>No subscriptions yet</p>
                    <p className="text-sm">Tap "+ Add New" or connect your bank</p>
                  </div>
                ) : (
                  subscriptions.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      subscription={sub}
                      onEdit={(id) => {
                        const sub = subscriptions.find((s) => s.id === id)
                        if (sub) {
                          const cancelInfo = prompt('Cancellation info:', sub.cancellationInfo)
                          if (cancelInfo !== null) {
                            handleEdit(id, { cancellationInfo: cancelInfo })
                          }
                        }
                      }}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Send test notification button */}
            <div className="pt-2">
              <button
                onClick={() => sendPushNotification('Test Reminder', 'This is a test notification')}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                Test Push Notification
              </button>
            </div>
          </>
        ) : activeTab === 'add' ? (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Add Subscription
            </h2>
            <AddSubscriptionForm
              onSubmit={handleAdd}
              onClose={() => setActiveTab('dashboard')}
            />
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">History</h2>
            <p className="text-gray-400">
              Subscription history coming soon...
            </p>
          </div>
        )}
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

// Bank Connection Card Component
function BankConnectionCard({ userId, onDisconnect }: { userId: string; onDisconnect: () => void }) {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')

  useEffect(() => {
    const checkConnection = async () => {
      const { data } = await supabase
        .from('bank_connections')
        .select('status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single()

      setStatus(data ? 'connected' : 'disconnected')
    }
    checkConnection()
  }, [userId])

  if (status === 'loading') return null

  return (
    <div className={`rounded-xl p-4 ${status === 'connected' ? 'bg-green-900/20 border border-green-800' : 'bg-gray-900 border border-gray-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{status === 'connected' ? '🔗' : '🏦'}</span>
          <div>
            <h4 className="font-semibold text-white">
              {status === 'connected' ? 'Bank Connected' : 'Connect Bank'}
            </h4>
            <p className="text-sm text-gray-400">
              {status === 'connected' ? 'Auto-detect subscriptions' : 'Use Open Banking to find subscriptions'}
            </p>
          </div>
        </div>
        <button
          onClick={status === 'connected' ? onDisconnect : undefined}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            status === 'connected'
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          disabled={status !== 'connected'}
        >
          {status === 'connected' ? 'Connected' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
