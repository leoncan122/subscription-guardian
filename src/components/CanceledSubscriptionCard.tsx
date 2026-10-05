'use client'

import { formatCurrency, getCategoryColor } from '@/utils/helpers'
import type { Category } from '@/types/subscription'
import { useTranslation, categoryLabel, billingCycleLabel } from '@/i18n'
import {
  accumulatedSaving,
  monthsSinceCancellation,
  monthlyCost,
  type CanceledSubscription,
} from '@/lib/subscription-history'

// A cancelled subscription in the history list, with what not paying it
// has saved so far.
export function CanceledSubscriptionCard({
  subscription,
  locale,
}: {
  subscription: CanceledSubscription
  locale: string
}) {
  const { t } = useTranslation()
  const saved = accumulatedSaving(subscription)
  const months = monthsSinceCancellation(subscription)

  return (
    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-200 truncate">{subscription.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${getCategoryColor(subscription.category as Category)}`}>
              {categoryLabel(t, subscription.category)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {subscription.canceledAt
              ? t('history.canceledOn', { date: formatDate(subscription.canceledAt, locale) })
              : t('history.canceledDateUnknown')}
            {months !== null && (
              <> · {months === 0 ? t('history.monthsSinceZero') : t('history.monthsSince', { count: months })}</>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('history.perMonth', {
              amount: formatCurrency(monthlyCost(subscription), subscription.currency, locale),
            })}
            {' · '}
            {billingCycleLabel(t, subscription.billingCycle)}
          </p>
        </div>

        {saved > 0 && (
          <div className="text-right shrink-0">
            <p className="text-base font-semibold text-green-400 tabular-nums">
              +{formatCurrency(saved, subscription.currency, locale)}
            </p>
            <p className="text-[11px] text-gray-500">{t('history.savedAmount')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  } catch {
    return iso.slice(0, 10)
  }
}
