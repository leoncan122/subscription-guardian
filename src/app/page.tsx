"use client";

import React, { useState, useEffect } from "react";
import { getSubscriptions, addSubscription, updateSubscription, deleteSubscription } from "@/db/database";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Header, TabBar } from "@/components/Header";
import { AddSubscriptionForm } from "@/components/AddSubscriptionForm";
import { SummaryCard, UpcomingCard } from "@/components/SummaryCard";
import {
  getTotalMonthly,
  getUpcomingSubscriptions,
  getNextRenewal,
  getDaysUntilRenewal,
} from "@/utils/helpers";
import { Subscription } from "@/types/subscription";
import { sendPushNotification } from "@/utils/push-notifications";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    try {
      const data = await getSubscriptions();
      setSubscriptions(data);
    } catch (error) {
      console.error("Failed to load subscriptions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(sub: Omit<Subscription, "id" | "createdAt" | "updatedAt">) {
    const id = await addSubscription(sub);
    await loadSubscriptions();
    setShowAddForm(false);
  }

  async function handleEdit(id: string, updates: Partial<Subscription>) {
    await updateSubscription(id, updates);
    await loadSubscriptions();
  }

  async function handleDelete(id: string) {
    await deleteSubscription(id);
    await loadSubscriptions();
  }

  async function handleToggle(id: string, active: boolean) {
    await updateSubscription(id, { active });
    await loadSubscriptions();
  }

  const totalMonthly = getTotalMonthly(subscriptions);
  const upcoming = getUpcomingSubscriptions(subscriptions, 7);
  const nextRenewal = getNextRenewal(subscriptions);

  const activeCount = subscriptions.filter((s) => s.active).length;
  const totalAnnual = totalMonthly * 12;

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <Header />

      <main className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === "dashboard" ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                title="Monthly"
                value={`$${totalMonthly.toFixed(2)}`}
                subtitle={`${activeCount} active sub`}
                icon="💰"
              />
              <SummaryCard
                title="Yearly"
                value={`$${totalAnnual.toFixed(2)}`}
                subtitle="Total estimate"
                icon="📈"
              />
            </div>

            {/* Next Renewal */}
            {nextRenewal && (
              <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl p-4">
                <p className="text-sm text-blue-100">Next Renewal</p>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {nextRenewal.name}
                    </h3>
                    <p className="text-sm text-blue-100">
                      {nextRenewal.currency === "USD"
                        ? `$${nextRenewal.amount.toFixed(2)}`
                        : `${nextRenewal.currency} ${nextRenewal.amount.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">
                      {new Date(nextRenewal.renewalDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                    <p className="text-xs text-blue-100">
                      {getDaysUntilRenewal(nextRenewal.renewalDate) <= 0
                        ? "Due today"
                        : getDaysUntilRenewal(nextRenewal.renewalDate) === 1
                        ? "Tomorrow"
                        : `${getDaysUntilRenewal(nextRenewal.renewalDate)} days`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Upcoming in 7 days
                </h3>
                <div className="space-y-2">
                  {upcoming.map((sub) => (
                    <UpcomingCard
                      key={sub.id}
                      name={sub.name}
                      amount={sub.amount}
                      days={getDaysUntilRenewal(sub.renewalDate)}
                      billingCycle={sub.billingCycle}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Subscriptions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">
                  All Subscriptions
                </h3>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-blue-400 text-sm font-medium hover:text-blue-300"
                >
                  {showAddForm ? "Cancel" : "+ Add New"}
                </button>
              </div>

              {showAddForm && (
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                  <AddSubscriptionForm
                    onSubmit={(data) => handleAdd(data)}
                    onClose={() => setShowAddForm(false)}
                  />
                </div>
              )}

              <div className="space-y-2">
                {subscriptions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-2">📋</p>
                    <p>No subscriptions yet</p>
                    <p className="text-sm">Tap "+ Add New" to get started</p>
                  </div>
                ) : (
                  subscriptions.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      subscription={sub}
                      onEdit={(id) => {
                        const sub = subscriptions.find((s) => s.id === id);
                        if (sub) {
                          const cancelInfo = prompt("Cancellation info:", sub.cancellationInfo);
                          if (cancelInfo !== null) {
                            handleEdit(id, { cancellationInfo: cancelInfo });
                          }
                        }
                      }}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Send test notification button */}
            <div className="pt-2">
              <button
                onClick={() => sendPushNotification("Test Reminder", "This is a test notification")}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                Test Push Notification
              </button>
            </div>
          </>
        ) : activeTab === "add" ? (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Add Subscription
            </h2>
            <AddSubscriptionForm
              onSubmit={(data) => handleAdd(data)}
              onClose={() => setActiveTab("dashboard")}
            />
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">History</h2>
            <p className="text-gray-400">
              Subscription history coming soon...
            </p>
          </div>
        )}
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
