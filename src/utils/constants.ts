import { BillingCycle, Category } from "@/types/subscription";

export const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export const CATEGORIES: {
  value: Category;
  label: string;
  icon: string;
}[] = [
  { value: "entertainment", label: "Entertainment", icon: "▶" },
  { value: "productivity", label: "Productivity", icon: "⚡" },
  { value: "storage", label: "Storage", icon: "☁" },
  { value: "sports", label: "Sports & Fitness", icon: "💪" },
  { value: "education", label: "Education", icon: "📚" },
  { value: "utility", label: "Utilities", icon: "⚙" },
  { value: "other", label: "Other", icon: "📦" },
];
