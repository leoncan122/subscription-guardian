"use client";

import React, { useState } from "react";
import { BILLING_CYCLES, CATEGORIES } from "@/utils/constants";
import { Category, BillingCycle, Subscription } from "@/types/subscription";
import { getNextMonth } from "@/utils/helpers";

interface AddSubscriptionFormProps {
  onSubmit: (data: Omit<Subscription, "id" | "createdAt" | "updatedAt">) => void;
  onClose?: () => void;
}

export function AddSubscriptionForm({ onSubmit, onClose }: AddSubscriptionFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [renewalDate, setRenewalDate] = useState(getNextMonth(new Date()));
  const [paymentMethod, setPaymentMethod] = useState("");
  const [cancellationInfo, setCancellationInfo] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [active, setActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount.trim()) return;

    onSubmit({
      name: name.trim(),
      amount: parseFloat(amount),
      currency,
      billingCycle,
      renewalDate,
      paymentMethod: paymentMethod.trim(),
      cancellationInfo: cancellationInfo.trim(),
      category,
      active,
    });

    if (onClose) onClose();
    else {
      // Reset form
      setName("");
      setAmount("");
      setPaymentMethod("");
      setCancellationInfo("");
      setActive(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="font-semibold text-white text-sm">Add Subscription</h3>

      <div>
        <label className="text-xs text-gray-400">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Netflix"
          className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400">Amount</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="MXN">MXN</option>
            <option value="BRL">BRL</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400">Billing Cycle</label>
          <select
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
          >
            {BILLING_CYCLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Renewal Date</label>
          <input
            type="date"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            required
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400">Category</label>
        <div className="flex gap-2 mt-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`text-xs px-2 py-1 rounded-full ${
                category === c.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400">Payment Method</label>
        <input
          type="text"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          placeholder="e.g. Visa ****4242"
          className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400">Cancellation Info</label>
        <textarea
          value={cancellationInfo}
          onChange={(e) => setCancellationInfo(e.target.value)}
          placeholder="How to cancel this service"
          rows={2}
          className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-blue-500"
        />
        <label htmlFor="active" className="text-sm text-gray-300">
          Currently active
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors text-sm"
        >
          Add Subscription
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
