import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Timer, Download, AlertTriangle } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { ageingReport } from "@/server/inventory";
import { PageHeader, Card, CardHeader, StatCard, Badge, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { TableShell, Th, Td, Tr } from "@/components/ui/Table";
import { VehicleImage } from "@/components/VehicleImage";
import { HorizontalBarChart } from "@/components/crm/Charts";
import { formatPrice, vehicleTitle } from "@/lib/utils";
import { ageingBucket } from "@/lib/constants";

export const metadata: Metadata = { title: "Inventory ageing" };
export const dynamic = "force-dynamic";

export default async function AgeingReportPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const report = await ageingReport(
    user.dealerId,
    user.branchIds.length ? user.branchIds : undefined,
  );

  const chartData = report.buckets.map((b) => ({ label: b.label, value: b.count }));
  const totalValue = report.buckets.reduce((s, b) => s + b.value, 0);
  const staleValue = report.buckets
    .filter((b) => b.key === "61-90" || b.key === "90+")
    .reduce((s, b) => s + b.value, 0);
  const avgDays = report.all.length
    ? Math.round(report.all.reduce((s, v) => s + v.days, 0) / report.all.length)
    : 0;

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/reports"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to reports
      </Link>

      <PageHeader
        title="Inventory ageing"
        description="How long each car has been sitting on your floor, and what that capital is worth."
        actions={
          can(user, PERMISSIONS.REPORTS_EXPORT) ? (
            <LinkButton href="/api/export/inventory?sort=ageing_desc" variant="outline" size="sm">
              <Download className="size-4" />
              Export
            </LinkButton>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vehicles in stock" value={report.total} tone="brand" icon={<Timer className="size-4" />} />
        <StatCard label="Total stock value" value={formatPrice(totalValue)} tone="info" />
        <StatCard label="Average days in stock" value={`${avgDays}d`} tone={avgDays > 45 ? "warning" : "success"} />
        <StatCard
          label="Capital in ageing stock"
          value={formatPrice(staleValue)}
          sub="60+ days"
          tone={staleValue ? "danger" : "neutral"}
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Distribution" description="Vehicles per ageing band" />
          <div className="mt-4">
            <HorizontalBarChart data={chartData} height={220} />
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader title="Value locked up per band" />
          </div>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {report.buckets.map((b) => {
              const bucket = ageingBucket(b.min);
              return (
                <li key={b.key} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2.5">
                    <Badge tone={bucket.tone} size="sm">{b.label}</Badge>
                    <span className="text-[13px] text-ink-600">
                      {b.count} vehicle{b.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="text-[13.5px] font-semibold text-ink-900 tabular-nums">
                    {formatPrice(b.value)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 font-display text-[16px] font-semibold text-ink-950">
          Every vehicle, oldest first
        </h2>

        {report.all.length ? (
          <TableShell
            mobile={
              <>
                {report.all.map((v) => {
                  const bucket = ageingBucket(v.days);
                  return (
                    <Link
                      key={v.id}
                      href={`/inventory/${v.id}`}
                      className="flex gap-3 rounded-[12px] border border-ink-200 bg-white p-3"
                    >
                      <div className="relative size-[70px] shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
                        <VehicleImage src={v.images[0]?.url} alt="" className="size-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10.5px] text-ink-400">{v.stockId}</p>
                        <p className="line-clamp-1 text-[13.5px] font-semibold text-ink-950">
                          {vehicleTitle(v)}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-ink-500">
                          {v.branch.name} · {formatPrice(v.sellingPrice)}
                        </p>
                        <div className="mt-1.5 flex gap-2">
                          <Badge tone={bucket.tone} size="sm">{v.days} days</Badge>
                          <Badge tone="neutral" size="sm">{v.enquiryCount} enquiries</Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </>
            }
          >
            <thead>
              <tr>
                <Th>Vehicle</Th>
                <Th>Branch</Th>
                <Th align="right">Price</Th>
                <Th align="center">Enquiries</Th>
                <Th align="center">Status</Th>
                <Th align="center">Days in stock</Th>
              </tr>
            </thead>
            <tbody>
              {report.all.map((v) => {
                const bucket = ageingBucket(v.days);
                return (
                  <Tr key={v.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-[8px] bg-ink-100">
                          <VehicleImage src={v.images[0]?.url} alt="" className="size-full" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/${v.id}`}
                            className="font-medium text-ink-900 hover:text-brand-700"
                          >
                            {vehicleTitle(v)}
                          </Link>
                          <p className="font-mono text-[11px] text-ink-400">{v.stockId}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{v.branch.name}</Td>
                    <Td align="right" className="font-semibold tabular-nums">
                      {formatPrice(v.sellingPrice)}
                    </Td>
                    <Td align="center" className="tabular-nums">
                      {v.enquiryCount || <span className="text-ink-300">—</span>}
                    </Td>
                    <Td align="center">
                      <Badge tone="neutral" size="sm">{v.status}</Badge>
                    </Td>
                    <Td align="center">
                      <Badge tone={bucket.tone} size="sm">{v.days}d</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No vehicles in stock" />
        )}
      </div>

      {report.stale.length > 0 && (
        <Card className="mt-6 border-warning-200 bg-warning-50/40">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-white text-warning-600">
              <AlertTriangle className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-warning-800">
                {report.stale.length} vehicles need attention
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-warning-800/80">
                These have been in stock over 60 days and represent {formatPrice(staleValue)} of
                tied-up capital. Consider a price review, fresh photography, or featuring them on
                your homepage. Vehicles with zero enquiries usually have a pricing or photo problem,
                not a demand problem.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
