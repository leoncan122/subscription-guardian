import { BillingCycle, Category } from "@/types/subscription";

// Labels live in src/i18n (billingCycles.* / categories.*).
export const BILLING_CYCLES: BillingCycle[] = ["weekly", "monthly", "quarterly", "yearly"];

export const CATEGORIES: {
  value: Category;
  icon: string;
}[] = [
  { value: "entertainment", icon: "▶" },
  { value: "productivity", icon: "⚡" },
  { value: "storage", icon: "☁" },
  { value: "sports", icon: "💪" },
  { value: "education", icon: "📚" },
  { value: "utility", icon: "⚙" },
  { value: "other", icon: "📦" },
];
