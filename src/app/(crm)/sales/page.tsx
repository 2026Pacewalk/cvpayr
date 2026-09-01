import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Handshake, Download, IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeMargin } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, StatCard, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { TableShell, Th, Td, Tr, Pagination } from "@/components/ui/Table";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { getAttentionSettings } from "@/server/attention";
import { BookingActions } from "@/components/crm/BookingActions";
import {
  formatPrice, formatDate, relativeTime, vehicleTitle, buildQuery, addDays,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Bookings & sales" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SALES_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  // The action centre links here with a bucket; that implies the bookings tab.
  const bucket = sp.bucket === "expiring" || sp.bucket === "unpaid" ? sp.bucket : undefined;
  const view = sp.view === "bookings" || bucket ? "bookings" : "sales";
  const page = Math.max(1, Number(sp.page ?? 1));
  const showMargin = canSeeMargin(user);

  const branchFilter = user.branchIds.length ? { branchId: { in: user.branchIds } } : {};
  const base = { dealerId: user.dealerId, ...branchFilter };

  // Narrows the bookings list to exactly what the action centre was counting,
  // so the number on the card matches the rows that appear here.
  const settings = await getAttentionSettings(user.dealerId);
  const bookingWhere =
    bucket === "expiring"
      ? {
          ...base,
          status: "active",
          bookedAt: { lt: addDays(new Date(), -(settings.bookingExpiryDays - 3)) },
        }
      : bucket === "unpaid"
        ? {
            ...base,
            status: "active",
            paymentStatus: { in: ["pending", "partial"] },
            bookedAt: { lt: addDays(new Date(), -3) },
          }
        : base;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [sales, salesTotal, bookings, bookingsTotal, monthAgg, ytdAgg, activeBookings] =
    await Promise.all([
      view === "sales"
        ? db.sale.findMany({
            where: base,
            orderBy: { soldAt: "desc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              vehicle: { select: { id: true, stockId: true, year: true, make: true, model: true, variant: true } },
              branch: { select: { name: true } },
              salesExecutive: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      db.sale.count({ where: base }),
      view === "bookings"
        ? db.booking.findMany({
            where: bookingWhere,
            orderBy: { bookedAt: "desc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              vehicle: { select: { id: true, stockId: true, year: true, make: true, model: true, variant: true } },
              branch: { select: { name: true } },
              salesExecutive: { select: { name: true } },
              lead: { select: { id: true } },
            },
          })
        : Promise.resolve([]),
      db.booking.count({ where: bookingWhere }),
      db.sale.aggregate({
        where: { ...base, soldAt: { gte: monthStart } },
        _sum: { salePrice: true, grossProfit: true },
        _count: { _all: true },
      }),
      db.sale.aggregate({
        where: { ...base, soldAt: { gte: addDays(new Date(), -365) } },
        _sum: { salePrice: true, grossProfit: true },
        _count: { _all: true },
      }),
      db.booking.count({ where: { ...base, status: "active" } }),
    ]);

  const bucketLabel =
    bucket === "expiring"
      ? "Bookings at risk of lapsing"
      : bucket === "unpaid"
        ? "Bookings with a balance outstanding"
        : null;

  const tabs = [
    { href: `/sales${buildQuery(sp, { view: undefined, page: undefined })}`, label: "Sales", count: salesTotal, active: view === "sales" },
    { href: `/sales${buildQuery(sp, { view: "bookings", page: undefined })}`, label: "Bookings", count: bookingsTotal, active: view === "bookings" },
  ];

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Bookings & sales"
        description="Every deal your team has closed, permanently archived."
        actions={
          <>
            <SegmentedTabs items={tabs} />
            {can(user, PERMISSIONS.REPORTS_EXPORT) && (
              <LinkButton href="/api/export/sales" variant="outline" size="sm">
                <Download className="size-4" />
                Export
              </LinkButton>
            )}
          </>
        }
      />

      {bucketLabel && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-[13px] font-medium text-warning-800">
            Showing only: {bucketLabel.toLowerCase()}
          </p>
          <Link
            href="/sales?view=bookings"
            className="text-[12.5px] font-semibold text-warning-800 hover:text-warning-900"
          >
            Show every booking
          </Link>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sold this month"
          value={monthAgg._count._all}
          sub={formatPrice(monthAgg._sum.salePrice ?? 0)}
          tone="success"
          icon={<Handshake className="size-4" />}
        />
        <StatCard
          label="Revenue (12 months)"
          value={formatPrice(ytdAgg._sum.salePrice ?? 0)}
          sub={`${ytdAgg._count._all} vehicles`}
          tone="brand"
          icon={<IndianRupee className="size-4" />}
        />
        {showMargin ? (
          <StatCard
            label="Gross profit (12 months)"
            value={formatPrice(ytdAgg._sum.grossProfit ?? 0)}
            sub={
              ytdAgg._sum.salePrice
                ? `${Math.round(((ytdAgg._sum.grossProfit ?? 0) / ytdAgg._sum.salePrice) * 1000) / 10}% of revenue`
                : undefined
            }
            tone="purple"
            icon={<TrendingUp className="size-4" />}
          />
        ) : (
          <StatCard
            label="Average sale price"
            value={formatPrice(
              ytdAgg._count._all ? Math.round((ytdAgg._sum.salePrice ?? 0) / ytdAgg._count._all) : 0,
            )}
            tone="purple"
          />
        )}
        <StatCard
          label="Active bookings"
          value={activeBookings}
          tone={activeBookings ? "warning" : "neutral"}
          icon={<Wallet className="size-4" />}
        />
      </div>

      {view === "sales" ? (
        sales.length ? (
          <>
            <TableShell
              mobile={
                <>
                  {sales.map((s) => (
                    <Card key={s.id} className="p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10.5px] text-ink-400">{s.reference}</p>
                          <Link
                            href={`/inventory/${s.vehicle.id}`}
                            className="line-clamp-1 text-[14px] font-semibold text-ink-950"
                          >
                            {vehicleTitle(s.vehicle)}
                          </Link>
                          <p className="mt-0.5 text-[12px] text-ink-500">
                            {s.customer.name} · {s.branch?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-[15px] font-semibold text-ink-950">
                            {formatPrice(s.salePrice)}
                          </p>
                          <p className="text-[11px] text-ink-400">{formatDate(s.soldAt)}</p>
                        </div>
                      </div>
                      {showMargin && (
                        <div className="mt-2 border-t border-ink-100 pt-2">
                          <Badge tone={s.grossProfit >= 0 ? "success" : "danger"} size="sm">
                            Profit {formatPrice(s.grossProfit)}
                          </Badge>
                        </div>
                      )}
                    </Card>
                  ))}
                </>
              }
            >
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Vehicle</Th>
                  <Th>Customer</Th>
                  <Th>Branch</Th>
                  <Th>Executive</Th>
                  <Th align="right">Sale price</Th>
                  {showMargin && <Th align="right">Gross profit</Th>}
                  <Th>Sold on</Th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-mono text-[11.5px] text-ink-500">{s.reference}</Td>
                    <Td>
                      <Link
                        href={`/inventory/${s.vehicle.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {vehicleTitle(s.vehicle)}
                      </Link>
                      <p className="font-mono text-[11px] text-ink-400">{s.vehicle.stockId}</p>
                    </Td>
                    <Td>
                      <Link
                        href={`/customers/${s.customer.id}`}
                        className="text-ink-700 hover:text-brand-700"
                      >
                        {s.customer.name}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{s.branch?.name ?? "—"}</Td>
                    <Td className="whitespace-nowrap">{s.salesExecutive?.name ?? "—"}</Td>
                    <Td align="right" className="font-semibold text-ink-900 tabular-nums">
                      {formatPrice(s.salePrice)}
                    </Td>
                    {showMargin && (
                      <Td align="right">
                        <span
                          className={
                            s.grossProfit >= 0
                              ? "font-medium text-success-700 tabular-nums"
                              : "font-medium text-danger-600 tabular-nums"
                          }
                        >
                          {formatPrice(s.grossProfit)}
                        </span>
                      </Td>
                    )}
                    <Td className="whitespace-nowrap text-[12.5px]">{formatDate(s.soldAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={page} pageSize={PAGE_SIZE} total={salesTotal} basePath="/sales" params={sp} />
          </>
        ) : (
          <EmptyState
            icon={<Handshake className="size-6" />}
            title="No sales recorded yet"
            description="Close a deal from any lead or vehicle and it will be archived here."
          />
        )
      ) : bookings.length ? (
        <>
          <div className="space-y-2.5">
            {bookings.map((b) => (
              <Card key={b.id} padded={false}>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11.5px] text-ink-400">{b.reference}</span>
                      <Badge
                        tone={
                          b.status === "converted" ? "success" : b.status === "cancelled" ? "neutral" : "warning"
                        }
                        size="sm"
                      >
                        {b.status}
                      </Badge>
                      <Badge tone={b.paymentStatus === "paid" ? "success" : "info"} size="sm">
                        {b.paymentStatus}
                      </Badge>
                    </div>
                    <Link
                      href={`/inventory/${b.vehicle.id}`}
                      className="mt-1.5 block text-[14.5px] font-semibold text-ink-950 hover:text-brand-700"
                    >
                      {vehicleTitle(b.vehicle)}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-ink-500">
                      <Link href={`/customers/${b.customer.id}`} className="hover:text-brand-700">
                        {b.customer.name}
                      </Link>
                      {b.branch && ` · ${b.branch.name}`}
                      {b.salesExecutive && ` · ${b.salesExecutive.name}`}
                      {" · "}
                      {relativeTime(b.bookedAt)}
                    </p>
                    {b.note && <p className="mt-1.5 text-[12.5px] text-ink-500">{b.note}</p>}
                  </div>

                  <div className="text-right">
                    <p className="field-label">Token</p>
                    <p className="font-display text-[15px] font-semibold text-ink-950">
                      {formatPrice(b.bookingAmount)}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-400">
                      of {formatPrice(b.agreedPrice)}
                    </p>
                  </div>

                  {can(user, PERMISSIONS.SALES_MANAGE) && b.status === "active" && (
                    <BookingActions
                      bookingId={b.id}
                      vehicleId={b.vehicle.id}
                      leadId={b.lead?.id ?? null}
                      customerName={b.customer.name}
                      customerPhone={b.customer.phone}
                      agreedPrice={b.agreedPrice}
                      vehicleLabel={vehicleTitle(b.vehicle)}
                    />
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={bookingsTotal}
            basePath="/sales"
            params={sp}
          />
        </>
      ) : (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="No bookings yet"
          description="Record a booking from a lead when a customer pays a token."
        />
      )}
    </div>
  );
}
