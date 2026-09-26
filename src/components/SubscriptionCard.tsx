import { useState } from "react";
import { getCategoryColor, formatCurrency } from "@/utils/helpers";
import { Subscription } from "@/types/subscription";
import { useTranslation, categoryLabel, billingCycleLabel, renewalText } from "@/i18n";

// How long the chasing-color ring plays before the detail view actually
// opens - long enough to see the light travel partway around the card.
const OPEN_ANIMATION_MS = 500;

export function SubscriptionCard({
  subscription,
  onOpenDetail,
  onDelete,
  onToggle,
}: {
  subscription: Subscription;
  onOpenDetail: (subscription: Subscription) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const [isOpening, setIsOpening] = useState(false);
  const daysUntilRenewal = getDaysUntilRenewal(subscription.renewalDate);
  const isUrgent = daysUntilRenewal <= 3;
  const categoryColor = getCategoryColor(subscription.category);

  const handleOpen = () => {
    if (isOpening) return;
    setIsOpening(true);
    window.setTimeout(() => {
      onOpenDetail(subscription);
      setIsOpening(false);
    }, OPEN_ANIMATION_MS);
  };

  return (
    <div className="relative rounded-xl p-[2px]">
      {isOpening && (
        <span className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none bg-gray-800">
          <span
            className="card-ring-spin absolute -inset-[150%] block blur-[2px]"
            style={{
              animationDuration: `${OPEN_ANIMATION_MS}ms`,
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, rgba(96,165,250,0) 225deg, #60a5fa 265deg, #a855f7 300deg, rgba(236,72,153,0) 340deg, transparent 360deg)",
            }}
          />
        </span>
      )}
      <div
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleOpen();
        }}
        className={`relative z-10 rounded-[10px] p-4 border transition-all cursor-pointer ${
          subscription.active
            ? "bg-gray-900 border-gray-800 hover:border-gray-700"
            : "bg-gray-900/50 border-gray-800/50 opacity-60"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-white text-sm">{subscription.name}</h4>
              <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor}`}>
                {categoryLabel(t, subscription.category)}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>
                  <span className="text-white font-medium">
                    {formatCurrency(subscription.amount, subscription.currency, locale)}
                  </span>{" "}
                  /{" "}
                  {billingCycleLabel(t, subscription.billingCycle)}
                </span>
                {subscription.paymentMethod && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span>{subscription.paymentMethod}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`${
                    isUrgent ? "text-red-400" : "text-gray-400"
                  }`}
                >
                  {renewalText(t, daysUntilRenewal)}
                </span>
                {subscription.cancellationInfo && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span className="text-blue-400 underline">
                      {t("subscription.howToCancel")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 ml-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(subscription.id, !subscription.active);
              }}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                subscription.active ? "bg-blue-600" : "bg-gray-700"
              }`}
              aria-label={subscription.active ? t("subscription.deactivate") : t("subscription.activate")}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  subscription.active ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(subscription.id);
              }}
              className="text-gray-500 hover:text-red-400 text-xs transition-colors"
              aria-label={t("subscription.delete")}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDaysUntilRenewal(renewalDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  const diff = renewal.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
