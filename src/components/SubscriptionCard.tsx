import { getCategoryColor, getRenewalText, formatCurrency, getBillingCycleLabel } from "@/utils/helpers";
import { Subscription } from "@/types/subscription";
import { useSettings } from "@/contexts/SettingsContext";

export function SubscriptionCard({
  subscription,
  onEdit,
  onDelete,
  onToggle,
}: {
  subscription: Subscription;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const { settings } = useSettings();
  const daysUntilRenewal = getDaysUntilRenewal(subscription.renewalDate);
  const isUrgent = daysUntilRenewal <= 3;
  const categoryColor = getCategoryColor(subscription.category);

  return (
    <div
      className={`rounded-xl p-4 border transition-all ${
        subscription.active
          ? "bg-gray-900 border-gray-800"
          : "bg-gray-900/50 border-gray-800/50 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-white text-sm">{subscription.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor}`}>
              {subscription.category}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>
                <span className="text-white font-medium">
                  {formatCurrency(subscription.amount, subscription.currency, settings.locale)}
                </span>{" "}
                /{" "}
                {getBillingCycleLabel(subscription.billingCycle)}
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
                {getRenewalText(daysUntilRenewal)}
              </span>
              {subscription.cancellationInfo && (
                <>
                  <span className="text-gray-600">•</span>
                  <span
                    className="text-blue-400 underline cursor-pointer"
                    onClick={() => onEdit(subscription.id)}
                    title={subscription.cancellationInfo}
                  >
                    How to cancel
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 ml-3">
          <button
            onClick={() => onToggle(subscription.id, !subscription.active)}
            className={`w-10 h-6 rounded-full transition-colors relative ${
              subscription.active ? "bg-blue-600" : "bg-gray-700"
            }`}
            aria-label={subscription.active ? "Deactivate" : "Activate"}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                subscription.active ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
          <button
            onClick={() => onDelete(subscription.id)}
            className="text-gray-500 hover:text-red-400 text-xs transition-colors"
            aria-label="Delete"
          >
            ✕
          </button>
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
