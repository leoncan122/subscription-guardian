'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Subscription } from '@/types/subscription';
import { getSubscriptions, addSubscription, updateSubscription, deleteSubscription, getBankConnections } from '@/lib/supabase/subscriptions';
import { syncFromCloud, syncToCloud } from '@/lib/supabase/sync';
import { connectBank, processBankingCallback, disconnectBank as disconnectBankFunc } from '@/lib/supabase/banking';
import { Header, TabBar } from '@/components/Header';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { SummaryCard } from '@/components/SummaryCard';

export default function DashboardPage() {
  const { user, loading: authLoading, signOut: logout } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showBankConnect, setShowBankConnect] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [user, authLoading]);

  // Load subscriptions and bank connections
  useEffect(() => {
    if (!user || authLoading) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [subs, banks] = await Promise.all([
          getSubscriptions(),
          getBankConnections(),
        ]);
        setSubscriptions(subs);
        setBankConnections(banks);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading]);

  const handleAddSubscription = async (sub: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newSub = await addSubscription(sub);
      if (newSub) {
        setSubscriptions(prev => [...prev, newSub]);
      }
    } catch (error) {
      console.error('Failed to add subscription:', error);
      alert('Failed to add subscription');
    }
  };

  const handleUpdateSubscription = async (id: string, updates: Partial<Subscription>) => {
    try {
      const updated = await updateSubscription(id, updates);
      if (updated) {
        setSubscriptions(prev => prev.map(s => s.id === id ? updated : s));
      }
    } catch (error) {
      console.error('Failed to update subscription:', error);
      alert('Failed to update subscription');
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      const deleted = await deleteSubscription(id);
      if (deleted) {
        setSubscriptions(prev => prev.filter(s => s.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete subscription:', error);
      alert('Failed to delete subscription');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { success, synced } = await syncToCloud();
      if (success) {
        alert(`Successfully synced ${synced} subscriptions to cloud`);
        // Reload from cloud
        const subs = await getSubscriptions();
        setSubscriptions(subs);
      } else {
        alert('Sync failed');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectBank = async () => {
    try {
      const result = await connectBank('test', 'Test Bank');
      // In production, this would redirect to the bank's OAuth page
      console.log('Bank connection result:', result);
    } catch (error) {
      console.error('Failed to connect bank:', error);
      alert('Failed to connect to bank');
    }
  };

  // Calculate summaries
  const monthlyTotal = subscriptions
    .filter(s => s.active)
    .reduce((sum, s) => {
      const amount = s.amount;
      switch (s.billingCycle) {
        case 'weekly': return sum + amount * 4.33;
        case 'quarterly': return sum + amount / 3;
        case 'yearly': return sum + amount / 12;
        default: return sum + amount;
      }
    }, 0);

  const yearlyTotal = monthlyTotal * 12;
  const renewalCount = subscriptions.filter(s => {
    const renewal = new Date(s.renewalDate);
    const now = new Date();
    const daysUntil = (renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 7;
  }).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <Header onLogout={logout} />

      {/* Bank connection banner */}
      {bankConnections.length === 0 && !showBankConnect && (
        <div className="p-4">
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white mb-1">🔗 Connect Your Bank</h3>
                <p className="text-xs text-gray-400">
                  Automatically detect subscriptions with Open Banking
                </p>
              </div>
              <button
                onClick={() => setShowBankConnect(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank connect form */}
      {showBankConnect && (
        <div className="p-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Select Your Bank</h3>
              <button
                onClick={() => setShowBankConnect(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['Santander', 'BBVA', 'CaixaBank', 'Sabadell', 'ING', 'N26', 'Revolut', 'Other'].map((bank) => (
                <button
                  key={bank}
                  onClick={handleConnectBank}
                  className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white text-sm transition-colors"
                >
                  {bank}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="p-4 space-y-4">
        <SummaryCard
          title="Monthly Total"
          amount={monthlyTotal}
          currency="USD"
          icon="📅"
          subtitle="Estimated monthly spending"
        />

        <div className="grid grid-cols-2 gap-4">
          <SummaryCard
            title="Yearly"
            amount={yearlyTotal}
            currency="USD"
            icon="📆"
            subtitle="Projected yearly cost"
          />
          <SummaryCard
            title="Renewals"
            amount={renewalCount}
            currency=""
            icon="⏰"
            subtitle="Renewing this week"
          />
        </div>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Syncing...
            </>
          ) : (
            <>🔄 Sync Subscriptions</>
          )}
        </button>

        {/* Subscriptions list */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            Your Subscriptions ({subscriptions.length})
          </h2>
          {subscriptions.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl mb-3 block">📭</span>
              <p className="text-gray-400 text-sm">No subscriptions yet</p>
              <button
                onClick={() => setActiveTab('add')}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Add First Subscription
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  subscription={sub}
                  onEdit={(id) => handleUpdateSubscription(id, {})}
                  onDelete={handleDeleteSubscription}
                  onToggle={(id, active) => handleUpdateSubscription(id, { active })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
