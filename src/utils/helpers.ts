import { Subscription, BillingCycle, Category } from "@/types/subscription";

export function getDaysUntilRenewal(renewalDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  const diff = renewal.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getNextMonth(date: Date): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

export function getMonthFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

export function getYearFromNow(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

export function getTotalMonthly(subscriptions: Subscription[]): number {
  return subscriptions
    .filter((s) => s.active)
    .reduce((sum, s) => {
      const monthly = convertToMonthly(s.amount, s.billingCycle);
      return sum + monthly;
    }, 0);
}

function convertToMonthly(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "weekly":
      return amount * 4.33;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

export function getUpcomingSubscriptions(
  subscriptions: Subscription[],
  days: number
): Subscription[] {
  return subscriptions
    .filter((s) => {
      if (!s.active) return false;
      const daysUntil = getDaysUntilRenewal(s.renewalDate);
      return daysUntil >= 0 && daysUntil <= days;
    })
    .sort((a, b) => getDaysUntilRenewal(a.renewalDate) - getDaysUntilRenewal(b.renewalDate));
}

export function getNextRenewal(subscriptions: Subscription[]): Subscription | undefined {
  return subscriptions
    .filter((s) => s.active)
    .sort(
      (a, b) => getDaysUntilRenewal(a.renewalDate) - getDaysUntilRenewal(b.renewalDate)
    )[0];
}

export function getCategoryColor(category: Category): string {
  const colors: Record<Category, string> = {
    entertainment: "bg-purple-500/20 text-purple-400",
    productivity: "bg-blue-500/20 text-blue-400",
    storage: "bg-cyan-500/20 text-cyan-400",
    sports: "bg-green-500/20 text-green-400",
    education: "bg-yellow-500/20 text-yellow-400",
    utility: "bg-orange-500/20 text-orange-400",
    other: "bg-gray-500/20 text-gray-400",
  };
  return colors[category] ?? colors.other;
}

export function getRenewalText(daysUntil: number): string {
  if (daysUntil <= 0) return "Due today";
  if (daysUntil === 1) return "Renews tomorrow";
  return `Renews in ${daysUntil} days`;
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function getBillingCycleLabel(cycle: BillingCycle): string {
  const labels: Record<BillingCycle, string> = {
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
  };
  return labels[cycle] ?? cycle;
}

export function getMonthlyBreakdown(
  subscriptions: Subscription[]
): { week: number; total: number }[] {
  // Simulate monthly breakdown by spreading renewals across weeks
  const breakdown = Array.from({ length: 4 }, () => ({ week: 1, total: 0 }));
  subscriptions
    .filter((s) => s.active)
    .forEach((s) => {
      const monthly = convertToMonthly(s.amount, s.billingCycle);
      const weekIndex = Math.min(Math.floor(Math.random() * 4), 3);
      breakdown[weekIndex].total += monthly;
    });
  return breakdown;
}
