'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useTranslation } from '@/i18n'
import { Subscription } from '@/types/subscription'
import {
  getSubscriptions,
  getCanceledSubscriptions,
  getAllSubscriptionCharges,
  SubscriptionCharge,
} from '@/lib/supabase/subscriptions'
import {
  totalAccumulatedSaving,
  monthlySpend,
  dominantCurrency,
  historyTotals,
  accumulatedSaving,
  type CanceledSubscription,
} from '@/lib/subscription-history'
import { useFxRates, convertAmount } from '@/lib/fx'
import { Header, TabBar } from '@/components/Header'
import { SummaryCard } from '@/components/SummaryCard'
import { SubscriptionCard } from '@/components/SubscriptionCard'
import { CanceledSubscriptionCard } from '@/components/CanceledSubscriptionCard'
import { MonthlySpendChart } from '@/components/MonthlySpendChart'
import { BASE_PATH } from '@/lib/constants'

export default function HistoryPage() {
  const { user, loading: authLoading, signOut: logout } = useAuth()
  const router = useRouter()
  const { settings } = useSettings()
  const { t } = useTranslation()

  const [active, setActive] = useState<Subscription[]>([])
  const [canceled, setCanceled] = useState<CanceledSubscription[]>([])
  const [charges, setCharges] = useState<SubscriptionCharge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = BASE_PATH + '/login'
    }
  }, [user, authLoading])

  useEffect(() => {
    if (!user || authLoading) return

    const load = async () => {
      setLoading(true)
      const [activeResult, canceledResult, chargesResult] = await Promise.allSettled([
        getSubscriptions(),
        getCanceledSubscriptions(),
        getAllSubscriptionCharges(),
      ])

      if (activeResult.status === 'fulfilled') setActive(activeResult.value)
      else console.error('Failed to load active subscriptions:', activeResult.reason)

      if (canceledResult.status === 'fulfilled') setCanceled(canceledResult.value)
      else console.error('Failed to load canceled subscriptions:', canceledResult.reason)

      if (chargesResult.status === 'fulfilled') setCharges(chargesResult.value)
      else console.error('Failed to load charges:', chargesResult.reason)

      setLoading(false)
    }

    load()
  }, [user, authLoading])

  const baseCurrency = settings.currency
  // Rates are only fetched when some cancelled subscription isn't already
  // in the base currency (see useFxRates).
  const fx = useFxRates(baseCurrency, canceled.map((s) => s.currency))

  const savings = useMemo(
    () =>
      totalAccumulatedSaving(canceled, baseCurrency, (amount, currency) =>
        convertAmount(amount, currency, fx),
      ),
    [canceled, baseCurrency, fx],
  )

  const totals = useMemo(() => historyTotals(active, canceled, charges), [active, canceled, charges])

  const spend = useMemo(() => {
    const currency = dominantCurrency(charges)
    if (!currency) return { months: [], excludedCurrencies: [] }
    return monthlySpend(charges, currency)
  }, [charges])

  // Biggest savings first - the point of the list is which cancellations paid off.
  const canceledSorted = useMemo(
    () => [...canceled].sort((a, b) => accumulatedSaving(b) - accumulatedSaving(a)),
    [canceled],
  )

  // Migration 014 not applied yet (or rows the backfill couldn't date):
  // their saving reads 0, so say why instead of showing a silent wrong total.
  const missingDates = canceled.some((s) => !s.canceledAt)

  const handleTabChange = (tab: string) => {
    if (tab === 'history') return
    router.push('/dashboard')
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-28">
      <Header onLogout={logout} />

      <div className="p-4 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white">{t('history.title')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('history.subtitle')}</p>
        </div>

        {/* Headline figure: money genuinely not paid since cancelling */}
        <SummaryCard
          title={t('history.savedSoFar')}
          amount={savings.total}
          currency={baseCurrency}
          locale={settings.locale}
          approximate={savings.converted}
          icon="💰"
          subtitle={t('history.savedSoFarSubtitle')}
        />
        {savings.excluded.length > 0 && (
          <p className="text-xs text-yellow-400/80 -mt-3">
            {t('history.excludedCurrencies', { currencies: savings.excluded.join(', ') })}
          </p>
        )}
        {missingDates && (
          <p className="text-xs text-yellow-400/80 -mt-3">{t('history.migrationPending')}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <SummaryCard
            title={t('history.activeNow')}
            amount={totals.activeCount}
            currency=""
            icon="✅"
            subtitle={t('history.activeNowSubtitle', { count: totals.activeCount })}
          />
          <SummaryCard
            title={t('history.canceled')}
            amount={totals.canceledCount}
            currency=""
            icon="🚪"
            subtitle={t('history.canceledSubtitle', { count: totals.canceledCount })}
          />
        </div>

        {totals.lifetimeSpendCurrency && (
          <>
            <SummaryCard
              title={t('history.lifetimeSpend')}
              amount={totals.lifetimeSpend}
              currency={totals.lifetimeSpendCurrency}
              locale={settings.locale}
              icon="🧾"
              subtitle={t('history.lifetimeSpendSubtitle', { count: charges.length })}
            />
            {totals.spendExcludedCurrencies.length > 0 && (
              <p className="text-xs text-yellow-400/80 -mt-3">
                {t('history.excludedCurrencies', {
                  currencies: totals.spendExcludedCurrencies.join(', '),
                })}
              </p>
            )}
          </>
        )}

        {/* Real spend per calendar month, from imported bank charges */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">{t('history.spendByMonth')}</h2>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <MonthlySpendChart months={spend.months} locale={settings.locale} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">{t('history.canceledList')}</h2>
          {canceledSorted.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('history.canceledEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {canceledSorted.map((sub) => (
                <CanceledSubscriptionCard key={sub.id} subscription={sub} locale={settings.locale} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">{t('history.activeList')}</h2>
          {active.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('history.activeEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {active.map((sub) => (
                <SubscriptionCard key={sub.id} subscription={sub} />
              ))}
            </div>
          )}
        </section>
      </div>

      <TabBar activeTab="history" onTabChange={handleTabChange} />
    </div>
  )
}
