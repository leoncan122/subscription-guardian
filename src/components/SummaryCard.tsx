import { formatCurrency } from "@/utils/helpers";

export function SummaryCard({
  title,
  amount,
  currency,
  locale,
  approximate,
  subtitle,
  icon,
}: {
  title: string;
  amount: number;
  currency?: string;
  locale?: string;
  // prefix with "≈" (amount includes currency conversions)
  approximate?: boolean;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded-full">
          {title}
        </span>
      </div>
      <p className="text-2xl font-bold text-white">
        {approximate && "≈ "}
        {currency ? formatCurrency(amount, currency, locale) : amount.toString()}
      </p>
      <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

export function UpcomingCard({
  name,
  amount,
  days,
  billingCycle,
}: {
  name: string;
  amount: number;
  days: number;
  billingCycle: string;
}) {
  const isUrgent = days <= 3;
  const isSoon = days <= 7;

  return (
    <div
      className={`rounded-lg p-3 border ${
        isUrgent
          ? "bg-red-500/10 border-red-500/30"
          : isSoon
            ? "bg-yellow-500/10 border-yellow-500/30"
            : "bg-gray-800 border-gray-700/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-white">{name}</h4>
          <p className="text-xs text-gray-400">
            {days === 0
              ? "Due today"
              : days === 1
                ? "Renews tomorrow"
                : `Renews in ${days} days`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-white">
            ${amount.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400 capitalize">{billingCycle}</p>
        </div>
      </div>
    </div>
  );
}
