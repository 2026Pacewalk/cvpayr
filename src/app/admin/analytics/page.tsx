import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, TrendingUp } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, CardHeader, StatCard, Badge } from "@/components/ui/primitives";
import { TableShell, Th, Td, Tr } from "@/components/ui/Table";
import { HorizontalBarChart, DonutChart, ChartLegend } from "@/components/crm/Charts";
import { formatPrice, addDays, pct } from "@/lib/utils";
import { LEAD_SOURCE_LABELS, DEALER_STATUSES } from "@/lib/constants";

export const metadata: Metadata = { title: "Platform analytics" };
export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireSuperAdmin();

  const from = addDays(new Date(), -90);

  const [dealers, sourceGroups, statusGroups, salesAgg, leadTotal, vehicleTotal] =
    await Promise.all([
      db.dealer.findMany({
        include: {
          subscription: { include: { plan: { select: { name: true } } } },
          _count: { select: { vehicles: true, leads: true, users: true, branches: true, customers: true } },
        },
      }),
      db.lead.groupBy({
        by: ["source"],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
      }),
      db.dealer.groupBy({ by: ["status"], _count: { _all: true } }),
      db.sale.aggregate({ _sum: { salePrice: true, grossProfit: true }, _count: { _all: true } }),
      db.lead.count(),
      db.vehicle.count(),
    ]);

  // Per-dealer sales, computed once and reused in the leaderboard.
  const dealerSales = await Promise.all(
    dealers.map(async (d) => {
      const agg = await db.sale.aggregate({
        where: { dealerId: d.id },
        _sum: { salePrice: true },
        _count: { _all: true },
      });
      return {
        id: d.id,
        name: d.name,
        slug: d.slug,
        status: d.status,
        plan: d.subscription?.plan.name ?? "—",
        vehicles: d._count.vehicles,
        leads: d._count.leads,
        users: d._count.users,
        customers: d._count.customers,
        sales: agg._count._all,
        gmv: agg._sum.salePrice ?? 0,
        conversion: d._count.leads ? pct(agg._count._all, d._count.leads) : 0,
      };
    }),
  );

  const leaderboard = dealerSales.sort((a, b) => b.gmv - a.gmv);

  const sourceData = sourceGroups
    .map((s) => ({ label: LEAD_SOURCE_LABELS[s.source] ?? s.source, value: s._count._all }))
    .sort((a, b) => b.value - a.value);

  const statusData = statusGroups.map((s) => ({
    label: DEALER_STATUSES.find((d) => d.value === s.status)?.label ?? s.status,
    value: s._count._all,
  }));

  const inventoryByDealer = leaderboard
    .slice(0, 8)
    .map((d) => ({ label: d.name, value: d.vehicles }));

  return (
    <div>
      <PageHeader
        title="Platform analytics"
        description="Aggregate activity across every tenant."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total GMV" value={formatPrice(salesAgg._sum.salePrice ?? 0)} tone="success" icon={<TrendingUp className="size-4" />} />
        <StatCard label="Vehicles sold" value={salesAgg._count._all} tone="brand" />
        <StatCard label="Leads captured" value={leadTotal} tone="purple" />
        <StatCard label="Vehicles listed" value={vehicleTotal} tone="info" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Lead sources" description="Across all dealers, last 90 days" />
          {sourceData.length ? (
            <>
              <DonutChart
                data={sourceData}
                centerLabel="leads"
                centerValue={sourceData.reduce((s, d) => s + d.value, 0)}
              />
              <div className="mt-3">
                <ChartLegend data={sourceData.slice(0, 7)} />
              </div>
            </>
          ) : (
            <p className="mt-6 text-center text-[13px] text-ink-400">No leads yet.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Accounts by status" />
          <div className="mt-4">
            <HorizontalBarChart data={statusData} height={200} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Inventory per dealer" description="Top accounts" />
          <div className="mt-4">
            <HorizontalBarChart data={inventoryByDealer} height={200} />
          </div>
        </Card>
      </div>

      <Card className="mt-5" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Dealer leaderboard"
            description="Ranked by gross merchandise value"
            icon={<BarChart3 className="size-4" />}
          />
        </div>
        <TableShell
          className="rounded-none border-0 border-t border-ink-100 shadow-none"
          mobile={
            <div className="space-y-2.5 p-4">
              {leaderboard.map((d) => (
                <Link
                  key={d.id}
                  href={`/admin/dealers/${d.id}`}
                  className="block rounded-[10px] border border-ink-200 p-3"
                >
                  <p className="text-[13.5px] font-semibold text-ink-950">{d.name}</p>
                  <p className="mt-1 text-[11.5px] text-ink-500">
                    {d.vehicles} vehicles · {d.leads} leads · {d.sales} sold
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-900">{formatPrice(d.gmv)}</p>
                </Link>
              ))}
            </div>
          }
        >
          <thead>
            <tr>
              <Th>Dealership</Th>
              <Th>Plan</Th>
              <Th align="center">Vehicles</Th>
              <Th align="center">Customers</Th>
              <Th align="center">Leads</Th>
              <Th align="center">Sold</Th>
              <Th align="center">Conversion</Th>
              <Th align="right">GMV</Th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((d) => {
              const status = DEALER_STATUSES.find((s) => s.value === d.status);
              return (
                <Tr key={d.id}>
                  <Td>
                    <Link
                      href={`/admin/dealers/${d.id}`}
                      className="font-medium text-ink-900 hover:text-brand-700"
                    >
                      {d.name}
                    </Link>
                    <div className="mt-0.5">
                      <Badge tone={status?.tone ?? "neutral"} size="sm">
                        {status?.label ?? d.status}
                      </Badge>
                    </div>
                  </Td>
                  <Td>{d.plan}</Td>
                  <Td align="center" className="tabular-nums">{d.vehicles}</Td>
                  <Td align="center" className="tabular-nums">{d.customers}</Td>
                  <Td align="center" className="tabular-nums">{d.leads}</Td>
                  <Td align="center" className="tabular-nums">{d.sales}</Td>
                  <Td align="center">
                    <Badge tone={d.conversion >= 10 ? "success" : "neutral"} size="sm">
                      {d.conversion}%
                    </Badge>
                  </Td>
                  <Td align="right" className="font-semibold text-ink-900 tabular-nums">
                    {formatPrice(d.gmv)}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
}
