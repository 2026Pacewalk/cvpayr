import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft, ExternalLink, Building2, Users, Car, IndianRupee, Mail, Phone, MapPin,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUsage, resolvePlan } from "@/lib/plan";
import { getActiveDiscount } from "@/lib/coupons";
import { normaliseCycle, yearlyPrice, yearlySaving } from "@/lib/billing";
import { PageHeader, Card, CardHeader, StatCard, Badge, DataList, ProgressBar, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import { DealerAdminControls } from "@/components/admin/DealerAdminControls";
import { formatPrice, formatDate, relativeTime, pct } from "@/lib/utils";
import { DEALER_STATUSES } from "@/lib/constants";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealer = await db.dealer.findUnique({ where: { id }, select: { name: true } });
  return { title: dealer?.name ?? "Dealer" };
}

export default async function AdminDealerDetailPage({ params, searchParams }: Props) {
  await requireSuperAdmin();

  const { id } = await params;
  const sp = await searchParams;

  const dealer = await db.dealer.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      branches: { orderBy: { sortOrder: "asc" } },
      users: {
        include: { role: { select: { name: true } } },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      },
      _count: { select: { vehicles: true, leads: true, customers: true, sales: true } },
    },
  });

  if (!dealer) notFound();

  const [plan, usage, plans, salesAgg, recentActivity, discount] = await Promise.all([
    resolvePlan(dealer.id),
    getUsage(dealer.id),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.sale.aggregate({ where: { dealerId: dealer.id }, _sum: { salePrice: true } }),
    db.auditLog.findMany({
      where: { dealerId: dealer.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
    getActiveDiscount(dealer.id),
  ]);

  const status = DEALER_STATUSES.find((s) => s.value === dealer.status);
  const limits = [
    { label: "Branches", used: usage.branches, limit: plan.limits.maxBranches },
    { label: "Staff", used: usage.users, limit: plan.limits.maxUsers },
    { label: "Vehicles", used: usage.vehicles, limit: plan.limits.maxVehicles },
  ];

  return (
    <div>
      <Link
        href="/admin/dealers"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to dealers
      </Link>

      {sp.created && (
        <Alert tone="success" title="Dealership onboarded" className="mb-4">
          The owner can sign in with the email and password you set.
        </Alert>
      )}

      <PageHeader
        title={dealer.name}
        description={`/d/${dealer.slug} · joined ${formatDate(dealer.createdAt)}`}
        breadcrumb={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status?.tone ?? "neutral"} dot>{status?.label ?? dealer.status}</Badge>
            {dealer.subscription && (
              <Badge tone="brand">{dealer.subscription.plan.name}</Badge>
            )}
          </div>
        }
        actions={
          <LinkButton href={`/d/${dealer.slug}`} target="_blank" variant="outline" size="sm">
            <ExternalLink className="size-4" />
            Public site
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Branches" value={dealer.branches.length} tone="brand" icon={<Building2 className="size-4" />} />
        <StatCard label="Vehicles" value={dealer._count.vehicles} tone="info" icon={<Car className="size-4" />} />
        <StatCard label="Leads captured" value={dealer._count.leads} tone="purple" icon={<Users className="size-4" />} />
        <StatCard
          label="GMV"
          value={formatPrice(salesAgg._sum.salePrice ?? 0)}
          sub={`${dealer._count.sales} sales`}
          tone="success"
          icon={<IndianRupee className="size-4" />}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Plan usage" description={`${plan.planName} · ${plan.status}`} />
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {limits.map((l) => {
                const unlimited = l.limit < 0;
                const percentage = unlimited ? 0 : pct(l.used, l.limit);
                return (
                  <div key={l.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="field-label">{l.label}</p>
                      <p className="text-[12px] text-ink-500 tabular-nums">
                        {l.used} / {unlimited ? "∞" : l.limit}
                      </p>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={unlimited ? 8 : percentage}
                        height="h-1.5"
                        tone={percentage >= 90 ? "danger" : percentage >= 70 ? "warning" : "brand"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {dealer.subscription && (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <DataList
                  columns={3}
                  items={[
                    { label: "Started", value: formatDate(dealer.subscription.startedAt) },
                    {
                      label: "Trial ends",
                      value: dealer.subscription.trialEndsAt
                        ? formatDate(dealer.subscription.trialEndsAt)
                        : "—",
                    },
                    {
                      label: "Renews",
                      value: dealer.subscription.currentPeriodEnd
                        ? formatDate(dealer.subscription.currentPeriodEnd)
                        : "—",
                    },
                    {
                      label: "Billing cycle",
                      value:
                        normaliseCycle(dealer.subscription.billingCycle) === "yearly"
                          ? `Yearly · ${formatPrice(yearlyPrice(dealer.subscription.plan.priceMonthly))}`
                          : `Monthly · ${formatPrice(dealer.subscription.plan.priceMonthly)}`,
                    },
                  ]}
                />
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader title="Branches" description={`${dealer.branches.length} locations`} />
            </div>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {dealer.branches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 p-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink-900">{b.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-500">
                      <MapPin className="size-3" />
                      {[b.city, b.state].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <Badge tone={b.isActive ? "success" : "neutral"} size="sm" dot>
                    {b.isActive ? "Active" : "Inactive"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader title="Users" description={`${dealer.users.length} accounts`} />
            </div>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {dealer.users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 p-4 sm:px-5">
                  <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink-900">{u.name}</p>
                    <p className="truncate text-[11.5px] text-ink-400">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {u.role && <Badge tone="purple" size="sm">{u.role.name}</Badge>}
                    {!u.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {recentActivity.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader title="Recent activity" />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 p-3.5 sm:px-5">
                    <p className="min-w-0 truncate text-[12.5px] text-ink-700">{a.summary}</p>
                    <span className="shrink-0 text-[11.5px] text-ink-400">
                      {relativeTime(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <DealerAdminControls
            dealerId={dealer.id}
            dealerName={dealer.name}
            status={dealer.status}
            currentPlanId={dealer.subscription?.planId ?? null}
            plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
            discount={
              discount
                ? { ...discount, expiresAt: discount.expiresAt?.toISOString() ?? null }
                : null
            }
            billingCycle={normaliseCycle(dealer.subscription?.billingCycle)}
            priceMonthly={dealer.subscription?.plan.priceMonthly ?? 0}
          />

          <Card>
            <CardHeader title="Account contact" />
            <div className="mt-4 space-y-3 text-[13px]">
              {dealer.contactPerson && (
                <p className="text-ink-700">{dealer.contactPerson}</p>
              )}
              {dealer.email && (
                <a href={`mailto:${dealer.email}`} className="flex items-center gap-2.5 break-all text-ink-700 hover:text-brand-700">
                  <Mail className="size-4 shrink-0 text-ink-400" />
                  {dealer.email}
                </a>
              )}
              {dealer.phone && (
                <p className="flex items-center gap-2.5 text-ink-700">
                  <Phone className="size-4 shrink-0 text-ink-400" />
                  {dealer.phone}
                </p>
              )}
              {(dealer.city || dealer.state) && (
                <p className="flex items-center gap-2.5 text-ink-700">
                  <MapPin className="size-4 shrink-0 text-ink-400" />
                  {[dealer.city, dealer.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            {dealer.gstin && (
              <p className="mt-4 border-t border-ink-100 pt-3 text-[12px] text-ink-500">
                GSTIN {dealer.gstin}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Data footprint" />
            <div className="mt-4">
              <DataList
                columns={2}
                items={[
                  { label: "Vehicles", value: dealer._count.vehicles },
                  { label: "Customers", value: dealer._count.customers },
                  { label: "Leads", value: dealer._count.leads },
                  { label: "Sales", value: dealer._count.sales },
                ]}
              />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
