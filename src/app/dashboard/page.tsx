'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Subscription, Category } from '@/types/subscription';
import {
  getSubscriptions, addSubscription, updateSubscription, deleteSubscription,
  getTrueLayerConnections, TrueLayerConnectionSummary, disconnectTrueLayerConnection,
  getPendingDetectedSubscriptions, confirmDetectedSubscription, dismissDetectedSubscription, dismissDetectedSubscriptions, DetectedSubscriptionRow,
  redetectSubscriptions,
} from '@/lib/supabase/subscriptions';
import { syncFromCloud, syncToCloud } from '@/lib/supabase/sync';
import { Header, TabBar } from '@/components/Header';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { SummaryCard } from '@/components/SummaryCard';
import { BASE_PATH } from '@/lib/constants';
import { getCategoryColor, formatCurrency } from '@/utils/helpers';
import { useSettings } from '@/contexts/SettingsContext';
import { useFxRates, monthlyTotalInBase } from '@/lib/fx';
import { getCountry } from '@/lib/locale';

const CURRENCY_SUGGESTION_DISMISSED_KEY = 'sg:currency-suggestion-dismissed';

function readDismissedSuggestion(): string | null {
  try {
    return localStorage.getItem(CURRENCY_SUGGESTION_DISMISSED_KEY);
  } catch {
    return null;
  }
}

// Most common account currency across connected banks, when none of the
// accounts is in the user's base currency (e.g. base EUR, all accounts GBP).
function suggestBaseCurrency(connections: TrueLayerConnectionSummary[], base: string): string | null {
  const counts = new Map<string, number>();
  for (const conn of connections) {
    for (const acc of conn.accounts) {
      const currency = (acc.currency || acc.balance_currency)?.toUpperCase();
      if (currency) counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }
  }
  if (counts.size === 0 || counts.has(base)) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function groupByCategory(items: DetectedSubscriptionRow[]): Record<string, DetectedSubscriptionRow[]> {
  return items.reduce<Record<string, DetectedSubscriptionRow[]>>((groups, item) => {
    const key = item.category || 'other';
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

export default function DashboardPage() {
  const { user, loading: authLoading, signOut: logout } = useAuth();
  const router = useRouter();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(readDismissedSuggestion);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [bankConnections, setBankConnections] = useState<TrueLayerConnectionSummary[]>([]);
  const [detectedSubs, setDetectedSubs] = useState<DetectedSubscriptionRow[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = BASE_PATH + '/login';
    }
  }, [user, authLoading]);

  // Load subscriptions and bank connections
  useEffect(() => {
    if (!user || authLoading) return;

    const loadData = async () => {
      setLoading(true);
      const [subsResult, banksResult, detectedResult] = await Promise.allSettled([
        getSubscriptions(),
        getTrueLayerConnections(),
        getPendingDetectedSubscriptions(),
      ]);

      if (subsResult.status === 'fulfilled') {
        setSubscriptions(subsResult.value);
      } else {
        console.error('Failed to load subscriptions:', subsResult.reason);
      }

      if (banksResult.status === 'fulfilled') {
        setBankConnections(banksResult.value);
      } else {
        console.error('Failed to load bank connections:', banksResult.reason);
      }

      if (detectedResult.status === 'fulfilled') {
        setDetectedSubs(detectedResult.value);
      } else {
        console.error('Failed to load detected subscriptions:', detectedResult.reason);
      }

      setLoading(false);
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

  const handleDismissAccount = async (connectionId: string) => {
    if (!confirm('Disconnect this bank account?')) return;
    const disconnected = await disconnectTrueLayerConnection(connectionId);
    if (disconnected) {
      setBankConnections(prev => prev.filter(c => c.id !== connectionId));
    } else {
      alert('Failed to disconnect bank account');
    }
  };

  const handleCheckSubscriptions = async (connectionId: string) => {
    setSyncing(true);
    try {
      const ok = await redetectSubscriptions(connectionId);
      if (ok) {
        const pending = await getPendingDetectedSubscriptions();
        setDetectedSubs(pending);
      } else {
        alert('Failed to check for subscriptions');
      }
    } catch (error) {
      console.error('Failed to check for subscriptions:', error);
      alert('Failed to check for subscriptions');
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmDetected = async (detected: DetectedSubscriptionRow) => {
    try {
      const newSub = await confirmDetectedSubscription(detected);
      if (newSub) {
        setDetectedSubs(prev => prev.filter(d => d.id !== detected.id));
        setSubscriptions(prev => [...prev, newSub]);
      } else {
        alert('Failed to confirm subscription');
      }
    } catch (error) {
      console.error('Failed to confirm subscription:', error);
      alert('Failed to confirm subscription');
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleDismissDetected = async (id: string) => {
    try {
      const dismissed = await dismissDetectedSubscription(id);
      if (dismissed) {
        setDetectedSubs(prev => prev.filter(d => d.id !== id));
      } else {
        alert('Failed to dismiss subscription');
      }
    } catch (error) {
      console.error('Failed to dismiss subscription:', error);
      alert('Failed to dismiss subscription');
    }
  };

  const handleDismissCategory = async (category: string, items: DetectedSubscriptionRow[]) => {
    if (!confirm(`Dismiss all ${items.length} detected subscriptions in "${category}"?`)) return;
    const ids = new Set(items.map(d => d.id));
    try {
      const dismissed = await dismissDetectedSubscriptions([...ids]);
      if (dismissed) {
        setDetectedSubs(prev => prev.filter(d => !ids.has(d.id)));
      } else {
        alert('Failed to dismiss subscriptions');
      }
    } catch (error) {
      console.error('Failed to dismiss subscriptions:', error);
      alert('Failed to dismiss subscriptions');
    }
  };

  const handleConfirmOnboarding = async () => {
    if (!(await updateSettings({ onboardedAt: new Date().toISOString() }))) {
      alert('Failed to save settings');
    }
  };

  const handleUseSuggestedCurrency = async (currency: string) => {
    if (!(await updateSettings({ currency }))) {
      alert('Failed to save settings');
    }
  };

  const handleKeepCurrency = (suggested: string) => {
    setDismissedSuggestion(suggested);
    try {
      localStorage.setItem(CURRENCY_SUGGESTION_DISMISSED_KEY, suggested);
    } catch {
      // storage unavailable (private mode) - the suggestion just comes back next visit
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

  // Calculate summaries - totals are in the user's base currency; other
  // currencies are converted with the day's ECB rates.
  const baseCurrency = settings.currency;
  const fx = useFxRates(baseCurrency, subscriptions.filter(s => s.active).map(s => s.currency));
  const { monthly: monthlyTotal, converted: totalIsConverted, excluded: excludedCurrencies } =
    monthlyTotalInBase(subscriptions, baseCurrency, fx);

  const yearlyTotal = monthlyTotal * 12;
  const renewalCount = subscriptions.filter(s => {
    const renewal = new Date(s.renewalDate);
    const now = new Date();
    const daysUntil = (renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 7;
  }).length;

  const residence = getCountry(settings.country);
  const suggestedCurrency = suggestBaseCurrency(bankConnections, baseCurrency);
  const showCurrencySuggestion =
    !!settings.onboardedAt && !!suggestedCurrency && suggestedCurrency !== dismissedSuggestion;

  const availableCategories = [...new Set(subscriptions.map(s => s.category))].sort();
  const availablePaymentMethods = [...new Set(subscriptions.map(s => s.paymentMethod).filter(Boolean))].sort();
  const filteredSubscriptions = subscriptions.filter(s =>
    (categoryFilter === 'all' || s.category === categoryFilter) &&
    (paymentMethodFilter === 'all' || s.paymentMethod === paymentMethodFilter)
  );

  if (authLoading || loading || settingsLoading) {
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
    <div className="min-h-screen shrink-0 bg-gray-950 pb-32">
      <Header onLogout={logout} />

      {/* First-visit confirmation of the browser-detected settings */}
      {!settings.onboardedAt && (
        <div className="p-4 pb-0">
          <div className="bg-gray-900 border border-blue-800 rounded-xl p-4">
            <h3 className="font-semibold text-white text-sm mb-1">👋 Is this right?</h3>
            <p className="text-xs text-gray-400">
              You live in <span className="text-white">{residence ? `${residence.flag} ${residence.label}` : settings.country}</span>
              {' · '}totals shown in <span className="text-white">{baseCurrency}</span>
              {' · '}e.g. <span className="text-white">{formatCurrency(1234.5, baseCurrency, settings.locale)}</span>
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleConfirmOnboarding}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Looks right
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected accounts are in a different currency than the base one */}
      {showCurrencySuggestion && suggestedCurrency && (
        <div className="p-4 pb-0">
          <div className="bg-gray-900 border border-yellow-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-300">
              Your bank accounts are in <span className="text-white font-medium">{suggestedCurrency}</span>, but totals are shown in{' '}
              <span className="text-white font-medium">{baseCurrency}</span>. Switch your base currency?
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleUseSuggestedCurrency(suggestedCurrency)}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Use {suggestedCurrency}
              </button>
              <button
                onClick={() => handleKeepCurrency(suggestedCurrency)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Keep {baseCurrency}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank connection banner */}
      {bankConnections.length === 0 ? (
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
                onClick={() => router.push('/connect-bank')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {bankConnections.map((conn) => (
            <div key={conn.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-sm">🏦 Bank Connected</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {conn.last_synced_at ? `Synced ${new Date(conn.last_synced_at).toLocaleDateString()}` : 'Not synced yet'}
                  </span>
                  <button
                    onClick={() => handleDismissAccount(conn.id)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                {conn.accounts.length === 0
                  ? 'No accounts found yet'
                  : `${conn.accounts.length} account${conn.accounts.length === 1 ? '' : 's'} linked`}
              </p>
              <button
                onClick={() => handleCheckSubscriptions(conn.id)}
                disabled={syncing}
                className="w-full mt-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
              >
                {syncing ? 'Checking…' : '🔄 Check for subscriptions'}
              </button>
            </div>
          ))}
          <button
            onClick={() => router.push('/connect-bank')}
            className="w-full py-2 border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm rounded-lg transition-colors"
          >
            + Connect another bank
          </button>
        </div>
      )}

      {/* Detected subscriptions pending review, grouped by category */}
      {detectedSubs.length > 0 && (
        <div className="p-4">
          <h2 className="text-lg font-semibold text-white mb-3">
            🔍 Detected Subscriptions ({detectedSubs.length})
          </h2>
          <div className="space-y-2">
            {Object.entries(groupByCategory(detectedSubs)).map(([category, items]) => {
              const isOpen = expandedCategories.has(category);
              return (
                <div key={category} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="flex items-center gap-2 pr-3">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="flex-1 flex items-center justify-between p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(category as Category)}`}>
                          {category}
                        </span>
                        <span className="text-xs text-gray-500">({items.length})</span>
                      </div>
                      <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    <button
                      onClick={() => handleDismissCategory(category, items)}
                      className="shrink-0 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
                    >
                      Dismiss all
                    </button>
                  </div>
                  {isOpen && (
                    <div className="space-y-2 p-3 pt-0">
                      {items.map((d) => (
                        <div key={d.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-800">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-white font-medium text-sm">{d.merchant_name}</p>
                              <p className="text-xs text-gray-400">
                                {formatCurrency(d.amount, d.currency, settings.locale)} · {d.billing_cycle} · seen {d.occurrence_count}x
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleConfirmDetected(d)}
                              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleDismissDetected(d.id)}
                              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="p-4 space-y-4">
        <SummaryCard
          title="Monthly Total"
          amount={monthlyTotal}
          currency={baseCurrency}
          locale={settings.locale}
          approximate={totalIsConverted}
          icon="📅"
          subtitle="Estimated monthly spending"
        />
        {excludedCurrencies.length > 0 && (
          <p className="text-xs text-yellow-400/80 -mt-2">
            Not included (no exchange rate available): {excludedCurrencies.join(', ')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <SummaryCard
            title="Yearly"
            amount={yearlyTotal}
            currency={baseCurrency}
            locale={settings.locale}
            approximate={totalIsConverted}
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">
              Your Subscriptions ({filteredSubscriptions.length}{filteredSubscriptions.length !== subscriptions.length ? ` of ${subscriptions.length}` : ''})
            </h2>
          </div>

          {subscriptions.length > 0 && (
            <div className="flex gap-2 mb-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 bg-gray-800 text-gray-300 text-xs px-2 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="flex-1 bg-gray-800 text-gray-300 text-xs px-2 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All banks / payment methods</option>
                {availablePaymentMethods.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}

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
          ) : filteredSubscriptions.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No subscriptions match this filter</p>
          ) : (
            <div className="space-y-3">
              {filteredSubscriptions.map((sub) => (
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
