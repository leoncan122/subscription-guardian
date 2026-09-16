// IndexedDB wrapper using idb library
import { openDB, IDBPDatabase } from "idb";
import { Subscription } from "@/types/subscription";

const DB_NAME = "subscription-guardian";
const DB_VERSION = 1;

interface SubscriptionDB {
  getSubscriptions(): Promise<Subscription[]>;
  getSubscription(id: string): Promise<Subscription | undefined>;
  addSubscription(sub: Subscription): Promise<string>;
  updateSubscription(id: string, updates: Partial<Subscription>): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
  clearSubscriptions(): Promise<void>;
  addSampleData(): Promise<void>;
}

// Open database connection
async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object store for subscriptions
      if (!db.objectStoreNames.contains("subscriptions")) {
        const store = db.createObjectStore("subscriptions", {
          keyPath: "id",
        });
        // Indexes for common queries
        store.createIndex("renewalDate", "renewalDate");
        store.createIndex("active", "active");
      }
    },
  });
}

// Exported database interface
export async function getSubscriptions(): Promise<Subscription[]> {
  const db = await getDB();
  return db.getAll("subscriptions");
}

export async function getSubscription(id: string): Promise<Subscription | undefined> {
  const db = await getDB();
  return db.get("subscriptions", id);
}

export async function addSubscription(sub: Omit<Subscription, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.add("subscriptions", {
    ...sub,
    id,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateSubscription(id: string, updates: Partial<Omit<Subscription, "id" | "createdAt">>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("subscriptions", id);
  if (!existing) throw new Error("Subscription not found");
  await db.put("subscriptions", {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteSubscription(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("subscriptions", id);
}

export async function clearSubscriptions(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("subscriptions", "readwrite");
  await tx.objectStore("subscriptions").clear();
  await tx.done;
}

export async function addSampleData(): Promise<void> {
  const db = await getDB();
  const count = await db.count("subscriptions");
  if (count > 0) return; // Don't add if data exists

  const now = new Date();
  const sampleSubscriptions: Subscription[] = [
    {
      id: "sample-1",
      name: "Netflix",
      amount: 15.99,
      currency: "USD",
      billingCycle: "monthly",
      renewalDate: getNextMonth(now),
      paymentMethod: "Visa ****4242",
      cancellationInfo: "Cancel anytime in Account Settings > Subscription",
      category: "entertainment",
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "sample-2",
      name: "Spotify Premium",
      amount: 9.99,
      currency: "USD",
      billingCycle: "monthly",
      renewalDate: getNextMonth(now),
      paymentMethod: "Visa ****4242",
      cancellationInfo: "Cancel in Account > Subscription settings",
      category: "entertainment",
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "sample-3",
      name: "Adobe Creative Cloud",
      amount: 54.99,
      currency: "USD",
      billingCycle: "monthly",
      renewalDate: getNextMonth(now),
      paymentMethod: "Mastercard ****8888",
      cancellationInfo: "Cancel via Adobe account page or call support",
      category: "productivity",
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "sample-4",
      name: "GitHub Pro",
      amount: 4.0,
      currency: "USD",
      billingCycle: "monthly",
      renewalDate: getNextMonth(now),
      paymentMethod: "Visa ****4242",
      cancellationInfo: "Cancel in Account settings > Billing",
      category: "productivity",
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "sample-5",
      name: "iCloud+",
      amount: 0.99,
      currency: "USD",
      billingCycle: "monthly",
      renewalDate: getNextMonth(now),
      paymentMethod: "Apple ID (linked card)",
      cancellationInfo: "Manage subscription in Apple ID settings",
      category: "storage",
      active: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "sample-6",
      name: "Adobe Stock Annual",
      amount: 299.88,
      currency: "USD",
      billingCycle: "yearly",
      renewalDate: getYearFromNow(now),
      paymentMethod: "Mastercard ****8888",
      cancellationInfo: "Contact Adobe support before renewal",
      category: "productivity",
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  const tx = db.transaction("subscriptions", "readwrite");
  for (const sub of sampleSubscriptions) {
    await tx.objectStore("subscriptions").add(sub);
  }
  await tx.done;
}

// Helper functions
function getNextMonth(date: Date): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

function getYearFromNow(date: Date): string {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}
