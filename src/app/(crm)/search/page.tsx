import type { Metadata } from "next";
import Link from "next/link";
import { Search, Car, Users, UserSquare2, Handshake } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Card, Badge, Avatar } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/SearchInput";
import { VehicleImage } from "@/components/VehicleImage";
import { formatPrice, formatKm, vehicleTitle, relativeTime, formatDate } from "@/lib/utils";
import { VEHICLE_STATUS_META, LEAD_STAGE_META, type VehicleStatus, type LeadStage } from "@/lib/constants";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  const sp = await searchParams;
  const q = sp.q?.trim();

  const branchFilter = user.branchIds.length ? { branchId: { in: user.branchIds } } : {};

  const [vehicles, leads, customers, sales] = q
    ? await Promise.all([
        can(user, PERMISSIONS.INVENTORY_VIEW)
          ? db.vehicle.findMany({
              where: {
                dealerId: user.dealerId,
                ...branchFilter,
                OR: [
                  { stockId: { contains: q } },
                  { registrationNumber: { contains: q } },
                  { make: { contains: q } },
                  { model: { contains: q } },
                  { variant: { contains: q } },
                ],
              },
              take: 6,
              include: {
                branch: { select: { name: true } },
                images: {
                  select: { url: true },
                  where: { kind: "photo" },
                  orderBy: [{ isCover: "desc" }],
                  take: 1,
                },
              },
            })
          : Promise.resolve([]),
        can(user, PERMISSIONS.LEADS_VIEW)
          ? db.lead.findMany({
              where: {
                dealerId: user.dealerId,
                ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
                OR: [
                  { reference: { contains: q } },
                  { customer: { name: { contains: q } } },
                  { customer: { phone: { contains: q } } },
                  { requirement: { contains: q } },
                ],
              },
              take: 6,
              include: {
                customer: { select: { name: true, phone: true } },
                vehicle: { select: { year: true, make: true, model: true } },
              },
            })
          : Promise.resolve([]),
        can(user, PERMISSIONS.CUSTOMERS_VIEW)
          ? db.customer.findMany({
              where: {
                dealerId: user.dealerId,
                OR: [
                  { name: { contains: q } },
                  { phone: { contains: q } },
                  { email: { contains: q } },
                ],
              },
              take: 6,
              include: { _count: { select: { leads: true, sales: true } } },
            })
          : Promise.resolve([]),
        can(user, PERMISSIONS.SALES_VIEW)
          ? db.sale.findMany({
              where: {
                dealerId: user.dealerId,
                ...branchFilter,
                OR: [
                  { reference: { contains: q } },
                  { customer: { name: { contains: q } } },
                  { vehicle: { stockId: { contains: q } } },
                ],
              },
              take: 5,
              include: {
                customer: { select: { name: true } },
                vehicle: { select: { id: true, year: true, make: true, model: true, stockId: true } },
              },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const totalResults = vehicles.length + leads.length + customers.length + sales.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Search"
        description="Stock IDs, registration numbers, customer names, phone numbers and references."
      />

      <div className="mb-6">
        <SearchInput placeholder="Search everything…" autoFocus />
      </div>

      {!q ? (
        <Card>
          <p className="text-[13.5px] font-medium text-ink-900">Try searching for</p>
          <ul className="mt-3 space-y-2 text-[13px] text-ink-500">
            <li>
              <span className="font-mono text-ink-700">STK-0017</span> — a stock ID
            </li>
            <li>
              <span className="font-mono text-ink-700">PB10ER4521</span> — a registration number
            </li>
            <li>
              <span className="font-mono text-ink-700">LD-0003</span> — a lead reference
            </li>
            <li>
              <span className="text-ink-700">9878012345</span> — a customer mobile number
            </li>
            <li>
              <span className="text-ink-700">Creta</span> — a model name
            </li>
          </ul>
        </Card>
      ) : totalResults === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title={`Nothing matched “${q}”`}
          description="Check the spelling, or try a shorter search such as just the model name."
        />
      ) : (
        <div className="space-y-6">
          {vehicles.length > 0 && (
            <section>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-500">
                <Car className="size-4" />
                Vehicles ({vehicles.length})
              </h2>
              <ul className="space-y-2">
                {vehicles.map((v) => {
                  const status = VEHICLE_STATUS_META[v.status as VehicleStatus];
                  return (
                    <li key={v.id}>
                      <Link
                        href={`/inventory/${v.id}`}
                        className="flex items-center gap-3 rounded-[12px] border border-ink-200 bg-white p-3 transition-shadow hover:shadow-sm"
                      >
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-[8px] bg-ink-100">
                          <VehicleImage src={v.images[0]?.url} alt="" className="size-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10.5px] text-ink-400">{v.stockId}</p>
                          <p className="truncate text-[13.5px] font-medium text-ink-950">
                            {vehicleTitle(v)}
                          </p>
                          <p className="text-[11.5px] text-ink-500">
                            {formatKm(v.kmDriven)} · {v.branch.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold text-ink-950">
                            {formatPrice(v.sellingPrice)}
                          </p>
                          <Badge tone={status.tone} size="sm">{status.label}</Badge>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {leads.length > 0 && (
            <section>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-500">
                <UserSquare2 className="size-4" />
                Leads ({leads.length})
              </h2>
              <ul className="space-y-2">
                {leads.map((l) => {
                  const stage = LEAD_STAGE_META[l.stage as LeadStage];
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/leads/${l.id}`}
                        className="flex items-center gap-3 rounded-[12px] border border-ink-200 bg-white p-3 transition-shadow hover:shadow-sm"
                      >
                        <Avatar name={l.customer.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink-950">
                            {l.customer.name}
                          </p>
                          <p className="text-[11.5px] text-ink-500">
                            <span className="font-mono">{l.reference}</span> · {l.customer.phone}
                            {l.vehicle && ` · ${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model}`}
                          </p>
                        </div>
                        <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {customers.length > 0 && (
            <section>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-500">
                <Users className="size-4" />
                Customers ({customers.length})
              </h2>
              <ul className="space-y-2">
                {customers.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center gap-3 rounded-[12px] border border-ink-200 bg-white p-3 transition-shadow hover:shadow-sm"
                    >
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-ink-950">{c.name}</p>
                        <p className="text-[11.5px] text-ink-500">
                          {c.phone}
                          {c.city && ` · ${c.city}`} · added {relativeTime(c.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Badge tone="neutral" size="sm">{c._count.leads} leads</Badge>
                        {c._count.sales > 0 && (
                          <Badge tone="success" size="sm">{c._count.sales} bought</Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sales.length > 0 && (
            <section>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-500">
                <Handshake className="size-4" />
                Sales ({sales.length})
              </h2>
              <ul className="space-y-2">
                {sales.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/inventory/${s.vehicle.id}`}
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-ink-200 bg-white p-3 transition-shadow hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink-950">
                          {vehicleTitle(s.vehicle)}
                        </p>
                        <p className="text-[11.5px] text-ink-500">
                          <span className="font-mono">{s.reference}</span> · {s.customer.name} ·{" "}
                          {formatDate(s.soldAt)}
                        </p>
                      </div>
                      <p className="shrink-0 text-[13px] font-semibold text-ink-950">
                        {formatPrice(s.salePrice)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
