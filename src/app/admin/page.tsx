import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Car, Users, IndianRupee, TrendingUp, ArrowRight } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatCard, Card, CardHeader, Badge, EmptyState } from "@/components/ui/primitives";
import { DonutChart, ChartLegend, HorizontalBarChart } from "@/components/crm/Charts";
import { formatPrice, relativeTime, formatDate, addDays } from "@/lib/utils";
import { platformMrr } from "@/lib/coupons";
import { DEALER_STATUSES } from "@/lib/constants";

export const metadata: Metadata = { title: "Platform overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    dealerCount, statusGroups, vehicleCount, userCount, leadCount,
    salesAgg, planGroups, recentDealers, topDealers, trialsEnding,
  ] = await Promise.all([
    db.dealer.count(),
    db.dealer.groupBy({ by: ["status"], _count: { _all: true } }),
    db.vehicle.count(),
    db.user.count({ where: { isSuperAdmin: false } }),
    db.lead.count(),
    db.sale.aggregate({ _sum: { salePrice: true }, _count: { _all: true } }),
    db.subscription.groupBy({ by: ["planId"], _count: { _all: true } }),
    db.dealer.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        subscription: { include: { plan: { select: { name: true } } } },
        _count: { select: { vehicles: true, users: true, branches: true } },
      },
    }),
    db.dealer.findMany({
      take: 6,
      include: {
        _count: { select: { vehicles: true, leads: true, users: true } },
        subscription: { include: { plan: { select: { name: true } } } },
      },
    }),
    db.subscription.findMany({
      where: { status: "trial", trialEndsAt: { lte: addDays(new Date(), 14) } },
      include: { dealer: { select: { id: true, name: true, slug: true } } },
      orderBy: { trialEndsAt: "asc" },
      take: 5,
    }),
  ]);

  const plans = await db.plan.findMany({ select: { id: true, name: true, priceMonthly: true } });
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const planPrice = new Map(plans.map((p) => [p.id, p.priceMonthly]));

  const statusData = statusGroups.map((s) => ({
    label: DEALER_STATUSES.find((d) => d.value === s.status)?.label ?? s.status,
    value: s._count._all,
  }));

  const planData = planGroups.map((p) => ({
    label: planName.get(p.planId) ?? "Unknown",
    value: p._count._all,
  }));

  // Monthly recurring revenue, net of every active coupon discount.
  const mrr = await platformMrr();

  const monthSales = await db.sale.count({ where: { soldAt: { gte: monthStart } } });

  return (
    <div>
      {/* Command band — the four numbers that describe the business at a glance */}
      <section className="relative overflow-hidden rounded-[20px] bg-ink-950 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-10 size-[380px] rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11.5px] font-semibold tracking-[0.1em] text-white/40 uppercase">
                Platform overview
              </p>
              <h1 className="mt-2 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] text-white sm:text-[32px]">
                Every dealership running on CarVyapar
              </h1>
            </div>
            <Link
              href="/admin/dealers/new"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-white px-4 text-[13.5px] font-medium text-ink-950 transition-colors hover:bg-white/90"
            >
              Onboard a dealer
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-7 border-t border-white/10 pt-7 lg:grid-cols-4">
            {[
              {
                k: "Net monthly revenue",
                v: formatPrice(mrr.net),
                sub: mrr.discount
                  ? `${formatPrice(mrr.discount)} discounted from ${formatPrice(mrr.gross)}`
                  : "across all subscriptions",
                icon: IndianRupee,
              },
              {
                k: "Dealerships",
                v: String(dealerCount),
                sub: `${statusGroups.find((s) => s.status === "active")?._count._all ?? 0} active`,
                icon: Building2,
              },
              { k: "Vehicles listed", v: String(vehicleCount), sub: "across all tenants", icon: Car },
              { k: "Staff accounts", v: String(userCount), sub: "dealer-side logins", icon: Users },
            ].map((s) => (
              <div key={s.k}>
                <dt className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-[0.04em] text-white/40 uppercase">
                  <s.icon className="size-3.5" />
                  {s.k}
                </dt>
                <dd className="mt-2.5 font-display text-[27px] leading-none font-semibold tabular-nums">
                  {s.v}
                </dd>
                <p className="mt-1.5 text-[12px] text-white/45">{s.sub}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads captured" value={leadCount} tone="brand" />
        <StatCard label="Vehicles sold" value={salesAgg._count._all} tone="success" />
        <StatCard
          label="GMV processed"
          value={formatPrice(salesAgg._sum.salePrice ?? 0)}
          tone="info"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard label="Sales this month" value={monthSales} tone="purple" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Accounts by status" />
          {statusData.length ? (
            <>
              <DonutChart data={statusData} centerLabel="dealers" centerValue={dealerCount} />
              <div className="mt-3">
                <ChartLegend data={statusData} />
              </div>
            </>
          ) : (
            <EmptyState compact title="No dealers yet" />
          )}
        </Card>

        <Card>
          <CardHeader title="Plan distribution" />
          <div className="mt-4">
            {planData.length ? (
              <HorizontalBarChart data={planData} height={200} />
            ) : (
              <EmptyState compact title="No subscriptions" />
            )}
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Trials ending soon"
              description="Next 14 days"
              action={
                <Link href="/admin/dealers?status=trial" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                  All trials
                </Link>
              }
            />
          </div>
          {trialsEnding.length ? (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {trialsEnding.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/dealers/${t.dealer.id}`}
                    className="flex items-center justify-between gap-3 p-3.5 hover:bg-ink-50 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-ink-900">
                        {t.dealer.name}
                      </p>
                      <p className="text-[11.5px] text-ink-400">
                        Trial ends {t.trialEndsAt ? formatDate(t.trialEndsAt) : "—"}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-ink-300" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-ink-100 p-5">
              <EmptyState compact title="No trials ending soon" />
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Dealerships"
            description="Usage at a glance"
            action={
              <Link href="/admin/dealers" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                Manage all
              </Link>
            }
          />
        </div>
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {topDealers.map((d) => {
            const status = DEALER_STATUSES.find((s) => s.value === d.status);
            return (
              <li key={d.id}>
                <Link
                  href={`/admin/dealers/${d.id}`}
                  className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-ink-50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-ink-950">{d.name}</p>
                      <Badge tone={status?.tone ?? "neutral"} size="sm" dot>
                        {status?.label ?? d.status}
                      </Badge>
                      {d.subscription && (
                        <Badge tone="brand" size="sm">{d.subscription.plan.name}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[11.5px] text-ink-400">/d/{d.slug}</p>
                  </div>
                  <dl className="flex gap-5 text-center">
                    {[
                      { k: "Vehicles", v: d._count.vehicles },
                      { k: "Leads", v: d._count.leads },
                      { k: "Users", v: d._count.users },
                    ].map((s) => (
                      <div key={s.k}>
                        <dd className="text-[14px] font-semibold text-ink-950 tabular-nums">{s.v}</dd>
                        <dt className="text-[10.5px] text-ink-400">{s.k}</dt>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-5" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Recently onboarded" />
        </div>
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {recentDealers.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-4 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink-900">{d.name}</p>
                <p className="text-[11.5px] text-ink-400">
                  {d._count.branches} branches · {d._count.users} users · joined{" "}
                  {relativeTime(d.createdAt)}
                </p>
              </div>
              <Link
                href={`/d/${d.slug}`}
                target="_blank"
                className="shrink-0 text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                View site
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
