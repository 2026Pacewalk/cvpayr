import type { Metadata } from "next";
import Link from "next/link";
import {
  Car, CheckCircle2, Clock3, Handshake, IndianRupee, TrendingUp, Users,
  CalendarClock, ArrowRight, Phone, MessageCircle, Timer,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeMargin } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import {
  getDashboard, getDashboardLists, getTrends, getLeadSourceBreakdown,
  getBranchPerformance, getPopularVehicles,
} from "@/server/dashboard";
import { getResponseStats } from "@/server/leads";
import { getAttention, attentionScope } from "@/server/attention";
import { AttentionCentre } from "@/components/crm/AttentionCentre";
import { MorningBrief } from "@/components/crm/MorningBrief";
import { briefLines, briefDismissKey } from "@/lib/attention";
import { dayKey } from "@/lib/notifications";
import { db } from "@/lib/db";
import { ResponseQueue, formatWait } from "@/components/crm/ResponseQueue";
import { StatCard, Card, CardHeader, EmptyState, Badge, ProgressBar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import { TrendAreaChart, DonutChart, ChartLegend, HorizontalBarChart } from "@/components/crm/Charts";
import { VehicleImage } from "@/components/VehicleImage";
import {
  formatPrice, formatINR, formatDate, formatTime, relativeTime, vehicleTitle,
  telHref, whatsappHref, pct,
} from "@/lib/utils";
import {
  LEAD_STAGE_META, LEAD_SOURCE_LABELS, VEHICLE_STATUS_META,
  type LeadStage, type VehicleStatus,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  const sp = await searchParams;
  const scope = {
    dealerId: user.dealerId,
    branchIds: user.branchIds.length ? user.branchIds : undefined,
    // A sales executive without `leads.view_all` sees only their own numbers.
    ownerId: can(user, PERMISSIONS.LEADS_VIEW_ALL) ? undefined : user.id,
  };

  const [stats, lists, trends, sources, branchPerf, popular, response] = await Promise.all([
    getDashboard(scope),
    getDashboardLists(scope),
    getTrends(scope, 30),
    getLeadSourceBreakdown(scope),
    can(user, PERMISSIONS.REPORTS_VIEW) ? getBranchPerformance(user.dealerId) : Promise.resolve([]),
    getPopularVehicles(user.dealerId, 5),
    can(user, PERMISSIONS.LEADS_VIEW) ? getResponseStats(scope) : Promise.resolve(null),
  ]);

  // Unresolved business work, computed from live state. Distinct from the
  // notification centre: that says what happened, this says what is still undone.
  const attention = await getAttention(attentionScope(user, sp.branch ?? null));

  // The day's brief, shown once per person per day. Built from the very same
  // action items as the cards below, so the two can never disagree.
  const dismissKey = briefDismissKey(dayKey());
  const briefDismissed = await db.actionDismissal.findUnique({
    where: { userId_actionKey: { userId: user.id, actionKey: dismissKey } },
    select: { id: true },
  });
  const brief = briefDismissed ? [] : briefLines(attention.items);

  const showMargin = canSeeMargin(user);
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const sourceData = sources.map((s) => ({
    label: LEAD_SOURCE_LABELS[s.source] ?? s.source,
    value: s.count,
  }));

  const ageingData = lists.ageing.buckets.map((b) => ({ label: b.label, value: b.count }));
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            {user.branchIds.length
              ? "Your branch at a glance"
              : `${user.dealerName} across all branches`}{" "}
            · {formatDate(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, PERMISSIONS.INVENTORY_CREATE) && (
            <LinkButton href="/inventory/new" size="sm">
              Add vehicle
            </LinkButton>
          )}
          {can(user, PERMISSIONS.LEADS_VIEW) && (
            <LinkButton href="/leads/pipeline" size="sm" variant="outline">
              Open pipeline
            </LinkButton>
          )}
        </div>
      </div>

      {sp.denied === "admin" && (
        <Alert tone="warning" title="Platform console is not available to your account" className="mb-5">
          The <code className="font-mono">/admin</code> area manages every dealership on
          CarVyapar.in and is restricted to platform staff. Sign in as the Super Admin
          (<code className="font-mono">admin@carvyapar.in</code>) to open it. Your dealership
          reports live under <Link href="/reports" className="font-medium underline">Reports</Link>.
        </Alert>
      )}

      <MorningBrief
        lines={brief}
        canWorkQueue={can(user, PERMISSIONS.LEADS_MANAGE)}
        dismissKey={dismissKey}
      />

      <AttentionCentre
        result={attention}
        limit={6}
        firstName={firstName}
        canAssign={can(user, PERMISSIONS.LEADS_ASSIGN)}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total inventory"
          value={stats.inventory.total}
          icon={<Car className="size-4" />}
          tone="brand"
          sub={`${stats.inventory.available} available`}
        />
        <StatCard
          label="Stock value"
          value={formatPrice(stats.inventory.value)}
          icon={<IndianRupee className="size-4" />}
          tone="info"
          sub={`${stats.inventory.reserved + stats.inventory.booked} held`}
        />
        <StatCard
          label="Open leads"
          value={stats.leads.open}
          icon={<Users className="size-4" />}
          tone="purple"
          sub={`${stats.leads.new} new · ${stats.leads.today} today`}
        />
        <StatCard
          label="Sales this month"
          value={stats.sales.monthSales}
          icon={<Handshake className="size-4" />}
          tone="success"
          sub={
            showMargin
              ? `${formatPrice(stats.sales.monthRevenue)} · ${formatPrice(stats.sales.monthProfit)} profit`
              : formatPrice(stats.sales.monthRevenue)
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's follow-ups"
          value={stats.followUps.today}
          icon={<CalendarClock className="size-4" />}
          tone={stats.followUps.today ? "warning" : "neutral"}
        />
        <StatCard
          label="Overdue"
          value={stats.followUps.overdue}
          icon={<Clock3 className="size-4" />}
          tone={stats.followUps.overdue ? "danger" : "neutral"}
        />
        <StatCard
          label="Upcoming test drives"
          value={stats.testDrives.upcoming}
          icon={<CheckCircle2 className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Bookings this month"
          value={stats.sales.monthBookings}
          icon={<TrendingUp className="size-4" />}
          tone="brand"
        />
      </div>

      {response && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Awaiting first reply"
            value={response.uncontacted}
            icon={<Timer className="size-4" />}
            tone={response.uncontacted ? "danger" : "success"}
            sub={response.uncontacted ? `oldest ${formatWait(response.oldestMinutes)}` : "all answered"}
          />
          <StatCard
            label="Waiting over 30 min"
            value={response.over30}
            tone={response.over30 ? "warning" : "neutral"}
          />
          <StatCard
            label="Waiting over 1 hour"
            value={response.over60}
            tone={response.over60 ? "danger" : "neutral"}
          />
          <StatCard
            label="Average first response"
            value={response.averageMinutes != null ? formatWait(response.averageMinutes) : "—"}
            tone={
              response.averageMinutes == null
                ? "neutral"
                : response.averageMinutes <= 30
                  ? "success"
                  : response.averageMinutes <= 120
                    ? "warning"
                    : "danger"
            }
            sub="from enquiry to first touch"
          />
        </div>
      )}

      {/* Charts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Leads & sales — last 30 days"
            description="Daily enquiry volume against closed deals"
          />
          <div className="mt-4">
            <TrendAreaChart data={trends} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Lead sources" description="Last 90 days" />
          {sourceData.length ? (
            <>
              <DonutChart
                data={sourceData}
                centerLabel="leads"
                centerValue={sourceData.reduce((s, d) => s + d.value, 0)}
              />
              <div className="mt-3">
                <ChartLegend data={sourceData.slice(0, 6)} />
              </div>
            </>
          ) : (
            <EmptyState compact title="No leads yet" description="Sources appear once enquiries arrive." />
          )}
        </Card>
      </div>

      {response && response.queue.length > 0 && (
        <div className="mt-5">
          <ResponseQueue
            items={response.queue}
            averageMinutes={response.averageMinutes}
            canManage={can(user, PERMISSIONS.LEADS_MANAGE)}
          />
        </div>
      )}

      {/* Lists */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Follow-ups */}
        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Follow-ups due"
              description="Overdue and today"
              action={
                <Link href="/followups" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
          </div>
          {lists.followUps.length ? (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {lists.followUps.map((f) => {
                const overdue = f.dueAt < new Date();
                return (
                  <li key={f.id} className="flex items-center gap-3 p-3.5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/leads/${f.lead.id}`}
                        className="line-clamp-1 text-[13.5px] font-medium text-ink-900 hover:text-brand-700"
                      >
                        {f.lead.customer.name}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">
                        {f.lead.vehicle
                          ? `${f.lead.vehicle.year} ${f.lead.vehicle.make} ${f.lead.vehicle.model}`
                          : f.note ?? "General enquiry"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={overdue ? "danger" : "warning"} size="sm">
                          {overdue ? "Overdue" : "Today"} · {formatTime(f.dueAt)}
                        </Badge>
                        <span className="text-[11.5px] text-ink-400 capitalize">{f.type}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <a
                        href={telHref(f.lead.customer.phone)}
                        aria-label={`Call ${f.lead.customer.name}`}
                        className="flex size-9 items-center justify-center rounded-[9px] border border-ink-200 text-ink-600 hover:bg-ink-50"
                      >
                        <Phone className="size-4" />
                      </a>
                      <a
                        href={whatsappHref(
                          f.lead.customer.phone,
                          `Hi ${f.lead.customer.name.split(" ")[0]}, following up on your enquiry.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="WhatsApp"
                        className="flex size-9 items-center justify-center rounded-[9px] bg-success-600 text-white hover:bg-success-700"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="border-t border-ink-100 p-5">
              <EmptyState
                compact
                icon={<CheckCircle2 className="size-5" />}
                title="Nothing due"
                description="You are on top of every follow-up."
              />
            </div>
          )}
        </Card>

        {/* Recent leads */}
        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Recent leads"
              description="Newest enquiries first"
              action={
                <Link href="/leads" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
          </div>
          {lists.recentLeads.length ? (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {lists.recentLeads.map((l) => {
                const stage = LEAD_STAGE_META[l.stage as LeadStage];
                return (
                  <li key={l.id}>
                    <Link
                      href={`/leads/${l.id}`}
                      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13.5px] font-medium text-ink-900">
                            {l.customer.name}
                          </p>
                          <span className="font-mono text-[10.5px] text-ink-400">{l.reference}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">
                          {l.vehicle ? vehicleTitle(l.vehicle) : "General enquiry"}
                          {l.branch && ` · ${l.branch.name}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                          <span className="text-[11.5px] text-ink-400">
                            {LEAD_SOURCE_LABELS[l.source] ?? l.source} · {relativeTime(l.createdAt)}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11.5px] text-ink-400">
                        {l.owner?.name.split(" ")[0] ?? "Unassigned"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="border-t border-ink-100 p-5">
              <EmptyState compact title="No leads yet" description="Enquiries from your website land here." />
            </div>
          )}
        </Card>
      </div>

      {/* Ageing + test drives */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Inventory ageing"
            description={`${lists.ageing.total} vehicles in stock`}
            action={
              can(user, PERMISSIONS.REPORTS_VIEW) ? (
                <Link href="/reports/ageing" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                  Detail
                </Link>
              ) : null
            }
          />
          <div className="mt-4">
            <HorizontalBarChart data={ageingData} height={180} />
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Upcoming test drives"
              action={
                <Link href="/test-drives" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
          </div>
          {lists.testDrives.length ? (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {lists.testDrives.map((t) => (
                <li key={t.id} className="p-3.5 sm:px-5">
                  <p className="text-[13.5px] font-medium text-ink-900">{t.customer.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">
                    {t.vehicle ? vehicleTitle(t.vehicle) : "Vehicle to be decided"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-400">
                    <Badge tone={t.status === "confirmed" ? "brand" : "info"} size="sm">
                      {t.status === "confirmed" ? "Confirmed" : "Requested"}
                    </Badge>
                    {formatDate(t.scheduledAt)} · {formatTime(t.scheduledAt)}
                    {t.branch && ` · ${t.branch.name}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-ink-100 p-5">
              <EmptyState compact title="No test drives booked" />
            </div>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader title="Most enquired cars" description="Across all branches" />
          </div>
          {popular.length ? (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {popular.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/inventory/${v.id}`}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-ink-50 sm:px-5"
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-[8px] bg-ink-100">
                      <VehicleImage src={v.images[0]?.url} alt="" className="size-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[13px] font-medium text-ink-900">
                        {v.year} {v.make} {v.model}
                      </p>
                      <p className="text-[11.5px] text-ink-500">{formatPrice(v.sellingPrice)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-ink-900 tabular-nums">
                        {v.enquiryCount}
                      </p>
                      <p className="text-[10.5px] text-ink-400">enquiries</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-ink-100 p-5">
              <EmptyState compact title="No data yet" />
            </div>
          )}
        </Card>
      </div>

      {/* Branch performance */}
      {branchPerf.length > 1 && (
        <Card className="mt-5">
          <CardHeader
            title="Branch performance"
            description="Last 90 days"
            action={
              <Link href="/reports" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                Full report
              </Link>
            }
          />
          <div className="mt-4 space-y-4">
            {branchPerf.map((b) => {
              const maxRevenue = Math.max(...branchPerf.map((x) => x.revenue), 1);
              return (
                <div key={b.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-medium text-ink-900">{b.name}</p>
                    <div className="flex items-center gap-4 text-[12px] text-ink-500">
                      <span>{b.stock} in stock</span>
                      <span>{b.leads} leads</span>
                      <span>{b.sales} sold</span>
                      <span className="font-semibold text-ink-900">{formatPrice(b.revenue)}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={pct(b.revenue, maxRevenue)} height="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent inventory */}
      <Card className="mt-5" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Recently added stock"
            action={
              <Link href="/inventory" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                All inventory
              </Link>
            }
          />
        </div>
        {lists.recentVehicles.length ? (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {lists.recentVehicles.map((v) => {
              const status = VEHICLE_STATUS_META[v.status as VehicleStatus];
              return (
                <li key={v.id}>
                  <Link
                    href={`/inventory/${v.id}`}
                    className="flex items-center gap-3.5 p-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
                      <VehicleImage src={v.images[0]?.url} alt="" className="size-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10.5px] text-ink-400">{v.stockId}</p>
                      <p className="line-clamp-1 text-[13.5px] font-medium text-ink-900">
                        {vehicleTitle(v)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-500">
                        {v.branch.name} · added {relativeTime(v.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13.5px] font-semibold text-ink-900">
                        {formatPrice(v.sellingPrice)}
                      </p>
                      <div className="mt-1">
                        <Badge tone={status.tone} size="sm">{status.label}</Badge>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border-t border-ink-100 p-5">
            <EmptyState
              compact
              icon={<Car className="size-5" />}
              title="No vehicles yet"
              description="Add your first car to publish it on your website."
              action={<LinkButton href="/inventory/new" size="sm">Add vehicle</LinkButton>}
            />
          </div>
        )}
      </Card>

      {showMargin && stats.sales.monthProfit > 0 && (
        <p className="mt-4 text-[12px] text-ink-400">
          Profit figures are visible to you because your role includes margin access. Gross profit
          this month: {formatINR(stats.sales.monthProfit)}.
        </p>
      )}
    </div>
  );
}
