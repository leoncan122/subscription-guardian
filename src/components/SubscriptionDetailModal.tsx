'use client';

import { useState } from 'react';
import { Subscription } from '@/types/subscription';
import type { SubscriptionCharge } from '@/lib/supabase/subscriptions';
import { getCategoryColor, formatCurrency } from '@/utils/helpers';
import { projectedYearlySaving, chargesTotal } from '@/lib/subscription-savings';
import { useTranslation, categoryLabel, billingCycleLabel } from '@/i18n';

export function SubscriptionDetailModal({
  subscription,
  charges,
  locale,
  onClose,
  onSaveCancellationInfo,
}: {
  subscription: Subscription;
  // null while the charge history is still loading
  charges: SubscriptionCharge[] | null;
  locale: string;
  onClose: () => void;
  onSaveCancellationInfo: (id: string, info: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editingCancellation, setEditingCancellation] = useState(false);
  const [cancellationDraft, setCancellationDraft] = useState(subscription.cancellationInfo);
  const [saving, setSaving] = useState(false);

  const isBankLinked = subscription.paymentMethod === 'Bank Account';
  const yearlySaving = projectedYearlySaving(subscription);
  const totals = charges ? chargesTotal(charges) : null;

  const handleSaveCancellation = async () => {
    setSaving(true);
    try {
      await onSaveCancellationInfo(subscription.id, cancellationDraft.trim());
    } finally {
      setSaving(false);
      setEditingCancellation(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{subscription.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(subscription.category)}`}>
                {categoryLabel(t, subscription.category)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              {formatCurrency(subscription.amount, subscription.currency, locale)} / {billingCycleLabel(t, subscription.billingCycle)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('subscriptionDetail.renewsOn', { date: new Date(subscription.renewalDate).toLocaleDateString(locale) })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('subscriptionDetail.close')}
            className="text-gray-500 hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        <div className="bg-gray-800/60 rounded-xl p-5 mb-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {t('subscriptionDetail.summaryTitle')}
          </h3>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{t('subscriptionDetail.totalSpent')}</span>
            <span className="text-white font-medium">
              {totals ? formatCurrency(totals.total, totals.currency, locale) : t('subscriptionDetail.totalSpentUnavailable')}
            </span>
          </div>
          {totals && totals.excludedCurrencies.length > 0 && (
            <p className="text-xs text-yellow-400/80">
              {t('dashboard.notIncluded', { currencies: totals.excludedCurrencies.join(', ') })}
            </p>
          )}

          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-gray-400">{t('subscriptionDetail.projectedSaving')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('subscriptionDetail.projectedSavingHint')}</p>
            </div>
            <span className="text-green-400 font-medium">
              {formatCurrency(yearlySaving, subscription.currency, locale)}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {t('subscriptionDetail.chargesTitle')}
          </h3>
          {charges === null ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : charges.length === 0 ? (
            <p className="text-sm text-gray-500">
              {isBankLinked ? t('subscriptionDetail.noChargesBank') : t('subscriptionDetail.noChargesManual')}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {/* charges are newest first; a row whose amount differs from the
                  one right after it (older) is where the price changed */}
              {charges.map((c, i) => {
                const older = i < charges.length - 1 ? charges[i + 1].amount : null;
                const priceRose = older !== null && c.amount > older;
                const priceFell = older !== null && c.amount < older;
                return (
                  <div
                    key={`${c.chargedOn}-${i}`}
                    className="flex items-center justify-between text-sm py-2 border-b border-gray-800/60 last:border-0"
                  >
                    <span className="text-gray-400">{new Date(c.chargedOn).toLocaleDateString(locale)}</span>
                    <span className={priceRose ? "text-yellow-400 font-medium" : priceFell ? "text-blue-400 font-medium" : "text-white"}>
                      {priceRose && "▲ "}
                      {priceFell && "▼ "}
                      {formatCurrency(c.amount, c.currency, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {t('subscriptionDetail.actionsTitle')}
          </h3>
          <div className="bg-gray-800/60 rounded-xl p-5">
            <p className="text-sm font-medium text-white mb-3">{t('subscriptionDetail.howToCancelTitle')}</p>

            {editingCancellation ? (
              <div className="space-y-2">
                <textarea
                  value={cancellationDraft}
                  onChange={(e) => setCancellationDraft(e.target.value)}
                  placeholder={t('subscriptionDetail.howToCancelPlaceholder')}
                  rows={3}
                  autoFocus
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveCancellation}
                    disabled={saving}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                  <button
                    onClick={() => {
                      setCancellationDraft(subscription.cancellationInfo);
                      setEditingCancellation(false);
                    }}
                    className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : subscription.cancellationInfo ? (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{subscription.cancellationInfo}</p>
                <button
                  onClick={() => setEditingCancellation(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                >
                  {t('subscriptionDetail.edit')}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-2">{t('subscriptionDetail.howToCancelEmpty')}</p>
                <button
                  onClick={() => setEditingCancellation(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {t('subscriptionDetail.addInstructions')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
