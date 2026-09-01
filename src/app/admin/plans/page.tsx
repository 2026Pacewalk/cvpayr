import type { Metadata } from "next";
import { CreditCard, Check, X } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, StatCard } from "@/components/ui/primitives";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { formatPrice, safeJsonParse } from "@/lib/utils";
import { platformMrr } from "@/lib/coupons";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

const FEATURE_LABELS: Record<string, string> = {
  crm: "CRM & pipeline",
  customDomain: "Custom domain",
  advancedReports: "Advanced reports",
  customBranding: "Custom branding",
  apiAccess: "API access",
  prioritySupport: "Priority support",
  bulkImport: "Bulk import",
};

export default async function AdminPlansPage() {
  await requireSuperAdmin();

  const [plans, counts, mrrTotals] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subscription.groupBy({ by: ["planId"], _count: { _all: true } }),
    platformMrr(),
  ]);

  const subscriberCount = (planId: string) =>
    counts.find((c) => c.planId === planId)?._count._all ?? 0;

  const mrr = mrrTotals.net;
  const totalSubs = counts.reduce((s, c) => s + c._count._all, 0);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Plans"
        description="Limits and feature flags live here — feature code never hardcodes a number."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active plans" value={plans.filter((p) => p.isActive).length} tone="brand" icon={<CreditCard className="size-4" />} />
        <StatCard label="Subscriptions" value={totalSubs} tone="info" />
        <StatCard
          label="Net monthly revenue"
          value={formatPrice(mrr)}
          sub={mrrTotals.discount ? `after ${formatPrice(mrrTotals.discount)} of coupons` : undefined}
          tone="success"
        />
        <StatCard
          label="Average revenue per dealer"
          value={formatPrice(totalSubs ? Math.round(mrr / totalSubs) : 0)}
          tone="purple"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const features = safeJsonParse<Record<string, boolean>>(plan.features, {});
          const subs = subscriberCount(plan.id);
          return (
            <Card key={plan.id} className={plan.isActive ? "" : "opacity-70"}>
              <CardHeader
                title={plan.name}
                description={plan.description ?? undefined}
                action={
                  <Badge tone={plan.isActive ? "success" : "neutral"} size="sm" dot>
                    {plan.isActive ? "Active" : "Hidden"}
                  </Badge>
                }
              />

              <p className="mt-4 font-display text-[26px] leading-none font-semibold text-ink-950">
                {formatPrice(plan.priceMonthly)}
                <span className="text-[13px] font-normal text-ink-400"> /month</span>
              </p>
              <p className="mt-1 text-[12px] text-ink-500">
                or {formatPrice(plan.priceYearly)} billed yearly
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-[12.5px]">
                {[
                  { k: "Branches", v: plan.maxBranches },
                  { k: "Staff", v: plan.maxUsers },
                  { k: "Vehicles", v: plan.maxVehicles },
                  { k: "Images per car", v: plan.maxImagesPerVehicle },
                ].map((l) => (
                  <div key={l.k}>
                    <dt className="text-ink-500">{l.k}</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900 tabular-nums">
                      {l.v < 0 ? "Unlimited" : l.v}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-4">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <li key={key} className="flex items-center gap-2 text-[12.5px]">
                    {features[key] ? (
                      <Check className="size-3.5 shrink-0 text-success-600" />
                    ) : (
                      <X className="size-3.5 shrink-0 text-ink-300" />
                    )}
                    <span className={features[key] ? "text-ink-700" : "text-ink-400"}>{label}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-100 pt-4">
                <p className="text-[12.5px] text-ink-500">
                  <span className="font-semibold text-ink-900">{subs}</span> subscriber
                  {subs === 1 ? "" : "s"}
                </p>
                <PlanEditor
                  plan={{
                    id: plan.id,
                    code: plan.code,
                    name: plan.name,
                    description: plan.description,
                    priceMonthly: plan.priceMonthly,
                    priceYearly: plan.priceYearly,
                    maxBranches: plan.maxBranches,
                    maxUsers: plan.maxUsers,
                    maxVehicles: plan.maxVehicles,
                    maxImagesPerVehicle: plan.maxImagesPerVehicle,
                    storageMb: plan.storageMb,
                    isActive: plan.isActive,
                    features,
                  }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="text-[14px] font-semibold text-ink-900">How limits are enforced</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          Every guarded action calls <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12px]">checkLimit(dealerId, kind)</code>{" "}
          before writing. Changing a number here immediately changes what dealers on that plan can
          do — no deploy, no code edit. Use <span className="font-medium">-1</span> for unlimited.
        </p>
      </Card>
    </div>
  );
}
