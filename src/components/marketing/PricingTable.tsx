"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus, Sparkles } from "lucide-react";
import {
  YEARLY_DISCOUNT_PERCENT, yearlyPrice, yearlySaving, yearlyMonthlyEquivalent,
  type BillingCycle,
} from "@/lib/billing";
import { formatPrice, cn } from "@/lib/utils";

export type PricingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  maxBranches: number;
  maxUsers: number;
  maxVehicles: number;
  maxImagesPerVehicle: number;
  features: Record<string, boolean>;
};

const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "crm", label: "Lead pipeline & CRM" },
  { key: "bulkImport", label: "Bulk vehicle import" },
  { key: "advancedReports", label: "Advanced reports" },
  { key: "customBranding", label: "Custom branding" },
  { key: "customDomain", label: "Custom domain" },
  { key: "apiAccess", label: "API access" },
  { key: "prioritySupport", label: "Priority support" },
];

const limit = (n: number) => (n < 0 ? "Unlimited" : String(n));

export function PricingTable({ plans }: { plans: PricingPlan[] }) {
  const [cycle, setCycle] = React.useState<BillingCycle>("yearly");

  return (
    <div>
      {/* Cycle toggle */}
      <div className="flex flex-col items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Billing cycle"
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1 shadow-xs"
        >
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={cn(
                "relative rounded-full px-5 py-2 text-[13.5px] font-medium transition-colors",
                cycle === c ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-800",
              )}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
              {c === "yearly" && (
                <span
                  className={cn(
                    "ml-2 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
                    cycle === c ? "bg-white/15 text-white" : "bg-success-50 text-success-700",
                  )}
                >
                  −{YEARLY_DISCOUNT_PERCENT}%
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-500">
          {cycle === "yearly"
            ? `Paying yearly takes ${YEARLY_DISCOUNT_PERCENT}% off automatically.`
            : `Switch to yearly and save ${YEARLY_DISCOUNT_PERCENT}% on every plan.`}
        </p>
      </div>

      {/* Cards */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((plan, i) => {
          const featured = i === 1;
          const perMonth =
            cycle === "yearly" ? yearlyMonthlyEquivalent(plan.priceMonthly) : plan.priceMonthly;
          const billed = cycle === "yearly" ? yearlyPrice(plan.priceMonthly) : plan.priceMonthly;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-[18px] border bg-white p-6 transition-shadow",
                featured
                  ? "border-brand-600 shadow-lg ring-1 ring-brand-600/10 lg:-mt-4 lg:pb-10"
                  : "border-ink-200 shadow-xs hover:shadow-md",
              )}
            >
              {featured && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-[11.5px] font-semibold text-white">
                  <Sparkles className="size-3" />
                  Most popular
                </span>
              )}

              <h3 className="font-display text-[18px] font-semibold text-ink-950">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1.5 min-h-[40px] text-[13px] leading-relaxed text-ink-500">
                  {plan.description}
                </p>
              )}

              <div className="mt-5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-[34px] leading-none font-semibold text-ink-950 tabular-nums">
                    {formatPrice(perMonth)}
                  </span>
                  <span className="text-[13px] text-ink-400">/month</span>
                </div>
                <p className="mt-2 text-[12.5px] text-ink-500">
                  {cycle === "yearly" ? (
                    <>
                      Billed {formatPrice(billed)} yearly ·{" "}
                      <span className="font-medium text-success-700">
                        save {formatPrice(yearlySaving(plan.priceMonthly))}
                      </span>
                    </>
                  ) : (
                    <>
                      Billed monthly ·{" "}
                      <span className="text-ink-400">
                        {formatPrice(yearlyPrice(plan.priceMonthly))} if paid yearly
                      </span>
                    </>
                  )}
                </p>
              </div>

              <Link
                href="/login"
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[14px] font-medium transition-colors",
                  featured
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "border border-ink-200 text-ink-800 hover:bg-ink-50",
                )}
              >
                Start free trial
              </Link>

              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5 text-[12.5px]">
                {[
                  { k: "Branches", v: limit(plan.maxBranches) },
                  { k: "Staff logins", v: limit(plan.maxUsers) },
                  { k: "Vehicles", v: limit(plan.maxVehicles) },
                  { k: "Photos per car", v: limit(plan.maxImagesPerVehicle) },
                ].map((l) => (
                  <div key={l.k}>
                    <dt className="text-ink-500">{l.k}</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900 tabular-nums">{l.v}</dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-5 space-y-2 border-t border-ink-100 pt-5">
                {FEATURE_ROWS.map((f) => (
                  <li key={f.key} className="flex items-center gap-2.5 text-[13px]">
                    {plan.features[f.key] ? (
                      <Check className="size-4 shrink-0 text-success-600" />
                    ) : (
                      <Minus className="size-4 shrink-0 text-ink-300" />
                    )}
                    <span className={plan.features[f.key] ? "text-ink-700" : "text-ink-400"}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[12.5px] text-ink-400">
        All plans include the public showroom, unlimited leads and every mobile feature. Prices
        exclude GST. Cancel any time.
      </p>
    </div>
  );
}
