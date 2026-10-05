'use client'

import { formatCurrency } from '@/utils/helpers'
import { useTranslation } from '@/i18n'
import type { MonthlySpend } from '@/lib/subscription-history'

// Pure-CSS bar chart: no chart library (the project has none, and this
// keeps the static-export bundle untouched). Bars are scaled against the
// highest month so the shape is readable regardless of absolute amounts.
export function MonthlySpendChart({
  months,
  locale,
}: {
  months: MonthlySpend[]
  locale: string
}) {
  const { t } = useTranslation()

  if (months.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">{t('history.spendByMonthEmpty')}</p>
    )
  }

  const max = Math.max(...months.map((m) => m.total))

  return (
    <div className="space-y-2">
      {months.map((month) => {
        // Floor at 2% so a tiny month is still visibly a bar, not a line.
        const width = max > 0 ? Math.max(2, (month.total / max) * 100) : 2
        return (
          <div key={month.month}>
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="text-xs text-gray-400 tabular-nums">{monthLabel(month.month, locale)}</span>
              <span className="text-xs font-medium text-white tabular-nums">
                {formatCurrency(month.total, month.currency, locale)}
              </span>
            </div>
            <div
              className="h-2.5 rounded-full bg-gray-700/40 overflow-hidden"
              role="img"
              aria-label={`${monthLabel(month.month, locale)}: ${formatCurrency(month.total, month.currency, locale)}, ${t('history.chargesInMonth', { count: month.chargeCount })}`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 'YYYY-MM' -> localized "Sept 2026". Day 1 at midday avoids the date
// rolling back a month in negative-offset timezones.
function monthLabel(month: string, locale: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, (m ?? 1) - 1, 1, 12)
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date)
  } catch {
    return month
  }
}
