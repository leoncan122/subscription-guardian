export type BillingCycle = "weekly" | "monthly" | "quarterly" | "yearly";
export type Category =
  | "entertainment"
  | "productivity"
  | "storage"
  | "sports"
  | "education"
  | "utility"
  | "other";

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  renewalDate: string; // YYYY-MM-DD
  paymentMethod: string;
  cancellationInfo: string;
  category: Category;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
