import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3, Download, TrendingUp, Timer, Users, Building2, Car, Target,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeMargin } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  getTrends, getLeadSourceBreakdown, getBranchPerformance, getStaffPerformance,
  getPopularVehicles, getPipelineCounts,
} from "@/server/dashboard";
import { ageingReport } from "@/server/inventory";
import { getOperationsMetrics, attentionScope } from "@/server/attention";
import { OperationsHealth } from "@/components/crm/OperationsHealth";
import { PageHeader, Card, CardHeader, StatCard, Badge, ProgressBar, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { TableShell, Th, Td, Tr } from "@/components/ui/Table";
import {
  TrendAreaChart, RevenueLineChart, DonutChart, ChartLegend, HorizontalBarChart,
} from "@/components/crm/Charts";
import { formatPrice, formatINR, buildQuery, addDays, pct, vehicleTitle } from "@/lib/utils";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_META, type LeadStage } from "@/lib/constants";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "12 months" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const days = Number(sp.range ?? 90);
  const from = addDays(new Date(), -days);
  const showMargin = canSeeMargin(user);

  const scope = {
    dealerId: user.dealerId,
    branchIds: user.branchIds.length ? user.branchIds : undefined,
  };
  const branchWhere = scope.branchIds ? { branchId: { in: scope.branchIds } } : {};

  const [
    trends, sources, branchPerf, staffPerf, popular, pipeline, ageing,
    salesAgg, leadTotals, wonCount, lostReasons,
  ] = await Promise.all([
    getTrends(scope, Math.min(days, 90)),
    getLeadSourceBreakdown(scope, days),
    getBranchPerformance(user.dealerId, days),
    getStaffPerformance(user.dealerId, days),
    getPopularVehicles(user.dealerId, 8),
    getPipelineCounts(scope),
    ageingReport(user.dealerId, scope.branchIds),
    db.sale.aggregate({
      where: { dealerId: user.dealerId, ...branchWhere, soldAt: { gte: from } },
      _sum: { salePrice: true, grossProfit: true },
      _count: { _all: true },
      _avg: { salePrice: true },
    }),
    db.lead.count({ where: { dealerId: user.dealerId, ...branchWhere, createdAt: { gte: from } } }),
    db.lead.count({
      where: { dealerId: user.dealerId, ...branchWhere, stage: "won", closedAt: { gte: from } },
    }),
    db.lead.groupBy({
      by: ["lostReason"],
      where: {
        dealerId: user.dealerId,
        ...branchWhere,
        stage: { in: ["lost", "not_interested"] },
        closedAt: { gte: from },
      },
      _count: { _all: true },
    }),
  ]);

  const sourceData = sources.map((s) => ({
    label: LEAD_SOURCE_LABELS[s.source] ?? s.source,
    value: s.count,
  }));
  const ageingData = ageing.buckets.map((b) => ({ label: b.label, value: b.count }));
  const lostData = lostReasons
    .filter((r) => r.lostReason)
    .map((r) => ({ label: r.lostReason as string, value: r._count._all }))
    .sort((a, b) => b.value - a.value);
  const pipelineData = pipeline
    .filter((p) => p.count > 0 && LEAD_STAGE_META[p.stage as LeadStage].group === "open")
    .map((p) => ({ label: p.label, value: p.count }));

  // Operational health, measured against the dealership's own thresholds rather
  // than an arbitrary industry number.
  const operations = await getOperationsMetrics(attentionScope(user), Math.min(days, 90));

  const conversion = leadTotals ? pct(wonCount, leadTotals) : 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Reports"
        description={`Performance across the last ${days} days`}
        actions={
          <>
            <SegmentedTabs
              items={RANGES.map((r) => ({
                href: `/reports${buildQuery(sp, { range: r.value === "90" ? undefined : r.value })}`,
                label: r.label,
                active: String(days) === r.value,
              }))}
            />
            {can(user, PERMISSIONS.REPORTS_EXPORT) && (
              <LinkButton href="/api/export/sales" variant="outline" size="sm">
                <Download className="size-4" />
                Export sales
              </LinkButton>
            )}
          </>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Vehicles sold"
          value={salesAgg._count._all}
          sub={`avg ${formatPrice(Math.round(salesAgg._avg.salePrice ?? 0))}`}
          tone="success"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Revenue"
          value={formatPrice(salesAgg._sum.salePrice ?? 0)}
          tone="brand"
        />
        {showMargin ? (
          <StatCard
            label="Gross profit"
            value={formatPrice(salesAgg._sum.grossProfit ?? 0)}
            sub={
              salesAgg._sum.salePrice
                ? `${pct(salesAgg._sum.grossProfit ?? 0, salesAgg._sum.salePrice)}% of revenue`
                : undefined
            }
            tone="purple"
          />
        ) : (
          <StatCard label="Leads received" value={leadTotals} tone="purple" />
        )}
        <StatCard
          label="Lead conversion"
          value={`${conversion}%`}
          sub={`${wonCount} won of ${leadTotals}`}
          tone={conversion >= 10 ? "success" : "warning"}
          icon={<Target className="size-4" />}
        />
      </div>

      {/* Operational health */}
      <div className="mt-5">
        <OperationsHealth metrics={operations} />
      </div>

      {/* Trends */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Leads & sales" description="Daily volume" />
          <div className="mt-4">
            <TrendAreaChart data={trends} height={240} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Lead sources" description={`Last ${days} days`} />
          {sourceData.length ? (
            <>
              <DonutChart data={sourceData} centerLabel="leads" centerValue={leadTotals} />
              <div className="mt-3">
                <ChartLegend data={sourceData.slice(0, 7)} />
              </div>
            </>
          ) : (
            <p className="mt-6 text-center text-[13px] text-ink-400">No leads in this period.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue trend" />
          <div className="mt-4">
            <RevenueLineChart data={trends} height={220} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Inventory ageing"
            action={
              <Link href="/reports/ageing" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                Detail
              </Link>
            }
          />
          <div className="mt-4">
            <HorizontalBarChart data={ageingData} height={200} />
          </div>
          <p className="mt-2 text-[12px] text-ink-500">
            {ageing.stale.length} vehicles have been in stock over 60 days.
          </p>
        </Card>
      </div>

      {/* Pipeline + lost reasons */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Open pipeline by stage" />
          <div className="mt-4">
            {pipelineData.length ? (
              <HorizontalBarChart data={pipelineData} height={240} />
            ) : (
              <p className="text-center text-[13px] text-ink-400">No open leads.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Why we lose deals" description={`Last ${days} days`} />
          <div className="mt-4">
            {lostData.length ? (
              <HorizontalBarChart data={lostData} height={240} color="#dc2626" />
            ) : (
              <p className="text-center text-[13px] text-ink-400">No lost leads recorded.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Branch performance */}
      {branchPerf.length > 0 && (
        <Card className="mt-4" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Branch performance"
              description={`Last ${days} days`}
              icon={<Building2 className="size-4" />}
            />
          </div>
          <TableShell
            className="rounded-none border-0 border-t border-ink-100 shadow-none"
            mobile={
              <div className="space-y-2.5 p-4">
                {branchPerf.map((b) => (
                  <div key={b.id} className="rounded-[10px] border border-ink-200 p-3">
                    <p className="text-[13.5px] font-semibold text-ink-950">{b.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-ink-500">
                      <span>{b.stock} in stock</span>
                      <span>{b.leads} leads</span>
                      <span>{b.sales} sold</span>
                      <span className="font-medium text-ink-900">{formatPrice(b.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <thead>
              <tr>
                <Th>Branch</Th>
                <Th align="center">In stock</Th>
                <Th align="center">Leads</Th>
                <Th align="center">Sold</Th>
                <Th align="center">Conversion</Th>
                <Th align="right">Revenue</Th>
                {showMargin && <Th align="right">Gross profit</Th>}
              </tr>
            </thead>
            <tbody>
              {branchPerf.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <Link href={`/inventory?branch=${b.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {b.name}
                    </Link>
                    <p className="text-[11.5px] text-ink-400">{b.city}</p>
                  </Td>
                  <Td align="center" className="tabular-nums">{b.stock}</Td>
                  <Td align="center" className="tabular-nums">{b.leads}</Td>
                  <Td align="center" className="tabular-nums">{b.sales}</Td>
                  <Td align="center">
                    <Badge tone={b.conversion >= 10 ? "success" : b.conversion > 0 ? "warning" : "neutral"} size="sm">
                      {b.conversion}%
                    </Badge>
                  </Td>
                  <Td align="right" className="font-semibold text-ink-900 tabular-nums">
                    {formatPrice(b.revenue)}
                  </Td>
                  {showMargin && (
                    <Td align="right" className="font-medium text-success-700 tabular-nums">
                      {formatPrice(b.profit)}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Staff performance */}
      {staffPerf.length > 0 && (
        <Card className="mt-4" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Sales executive performance"
              description={`Last ${days} days`}
              icon={<Users className="size-4" />}
            />
          </div>
          <TableShell
            className="rounded-none border-0 border-t border-ink-100 shadow-none"
            mobile={
              <div className="space-y-2.5 p-4">
                {staffPerf.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-[10px] border border-ink-200 p-3">
                    <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink-950">{s.name}</p>
                      <p className="text-[11.5px] text-ink-500">
                        {s.leads} leads · {s.sales} sold · {formatPrice(s.revenue)}
                      </p>
                    </div>
                    <Badge tone={s.conversion >= 15 ? "success" : "neutral"} size="sm">
                      {s.conversion}%
                    </Badge>
                  </div>
                ))}
              </div>
            }
          >
            <thead>
              <tr>
                <Th>Executive</Th>
                <Th align="center">Leads</Th>
                <Th align="center">Won</Th>
                <Th align="center">Conversion</Th>
                <Th align="center">Pending follow-ups</Th>
                <Th align="right">Revenue</Th>
                {showMargin && <Th align="right">Gross profit</Th>}
              </tr>
            </thead>
            <tbody>
              {staffPerf.map((s) => {
                const best = Math.max(...staffPerf.map((x) => x.revenue), 1);
                return (
                  <Tr key={s.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                        <div>
                          <p className="font-medium text-ink-900">{s.name}</p>
                          <p className="text-[11.5px] text-ink-400">{s.role?.name}</p>
                        </div>
                      </div>
                    </Td>
                    <Td align="center" className="tabular-nums">{s.leads}</Td>
                    <Td align="center" className="tabular-nums">{s.won}</Td>
                    <Td align="center">
                      <Badge tone={s.conversion >= 15 ? "success" : s.conversion > 0 ? "warning" : "neutral"} size="sm">
                        {s.conversion}%
                      </Badge>
                    </Td>
                    <Td align="center" className="tabular-nums">
                      {s.pendingFollowUps || <span className="text-ink-300">—</span>}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16">
                          <ProgressBar value={pct(s.revenue, best)} height="h-1.5" />
                        </div>
                        <span className="font-semibold text-ink-900 tabular-nums">
                          {formatPrice(s.revenue)}
                        </span>
                      </div>
                    </Td>
                    {showMargin && (
                      <Td align="right" className="font-medium text-success-700 tabular-nums">
                        {formatPrice(s.profit)}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Popular vehicles */}
      <Card className="mt-4" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Most enquired vehicles"
            description="Where customer attention is going right now"
            icon={<Car className="size-4" />}
          />
        </div>
        <TableShell
          className="rounded-none border-0 border-t border-ink-100 shadow-none"
          mobile={
            <div className="space-y-2.5 p-4">
              {popular.map((v) => (
                <Link
                  key={v.id}
                  href={`/inventory/${v.id}`}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-ink-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-900">{vehicleTitle(v)}</p>
                    <p className="text-[11.5px] text-ink-400">{formatPrice(v.sellingPrice)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-ink-950">{v.enquiryCount}</p>
                    <p className="text-[10.5px] text-ink-400">enquiries</p>
                  </div>
                </Link>
              ))}
            </div>
          }
        >
          <thead>
            <tr>
              <Th>Vehicle</Th>
              <Th>Stock ID</Th>
              <Th align="right">Price</Th>
              <Th align="center">Enquiries</Th>
              <Th align="center">Page views</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {popular.map((v) => (
              <Tr key={v.id}>
                <Td>
                  <Link href={`/inventory/${v.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {vehicleTitle(v)}
                  </Link>
                </Td>
                <Td className="font-mono text-[11.5px] text-ink-500">{v.stockId}</Td>
                <Td align="right" className="tabular-nums">{formatPrice(v.sellingPrice)}</Td>
                <Td align="center" className="font-semibold tabular-nums">{v.enquiryCount}</Td>
                <Td align="center" className="tabular-nums">{v.viewCount}</Td>
                <Td align="center">
                  <Badge tone="neutral" size="sm">{v.status}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Card>

      {showMargin && (
        <p className="mt-4 text-[12px] text-ink-400">
          Total gross profit in this period: {formatINR(salesAgg._sum.grossProfit ?? 0)}. Profit
          figures are hidden from roles without the margin permission.
        </p>
      )}
    </div>
  );
}
