import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Car, Download, Plus } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeMargin, canSeeCost } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  listVehicles, parseVehicleFilters, vehicleFacets, ageingDays, vehicleMargin,
} from "@/server/inventory";
import { getDealerBranches } from "@/server/dealer";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { FilterSheetButton, SortSelect, ActiveFilterChips, FilterSidebar } from "@/components/public/CarFilters";
import { InventoryTable, type InventoryRow } from "@/components/crm/InventoryTable";
import { formatPrice, buildQuery, vehicleTitle } from "@/lib/utils";
import { VEHICLE_STATUSES, VEHICLE_STATUS_META, type VehicleStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "ageing_desc", label: "Oldest in stock" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "km_asc", label: "Kilometres: Low to High" },
  { value: "year_desc", label: "Year: Newest first" },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.INVENTORY_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const filters = parseVehicleFilters(sp);
  const allowedBranchIds = user.branchIds.length ? user.branchIds : undefined;
  const opts = { dealerId: user.dealerId, allowedBranchIds };

  const [result, facets, branches, statusCounts, valueAgg] = await Promise.all([
    listVehicles(filters, { ...opts, pageSize: 20 }),
    vehicleFacets({ dealerId: user.dealerId }),
    getDealerBranches(user.dealerId),
    db.vehicle.groupBy({
      by: ["status"],
      where: { dealerId: user.dealerId, ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}) },
      _count: { _all: true },
    }),
    db.vehicle.aggregate({
      where: {
        dealerId: user.dealerId,
        status: { in: ["available", "reserved", "booked"] },
        ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
      },
      _sum: { sellingPrice: true },
      _count: { _all: true },
    }),
  ]);

  const showMargin = canSeeMargin(user);
  const countFor = (status: string) =>
    statusCounts.find((s) => s.status === status)?._count._all ?? 0;
  const total = statusCounts.reduce((s, c) => s + c._count._all, 0);

  const queryParams = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  const tabs = [
    { href: `/inventory${buildQuery(queryParams, { status: undefined, page: undefined })}`, label: "All", count: total, active: !filters.status },
    ...VEHICLE_STATUSES.map((s) => ({
      href: `/inventory${buildQuery(queryParams, { status: s, page: undefined })}`,
      label: VEHICLE_STATUS_META[s as VehicleStatus].label,
      count: countFor(s),
      active: filters.status === s,
    })),
  ];

  // Cost fields are stripped here, before the data reaches a client component.
  const canCost = canSeeCost(user);
  const rows: InventoryRow[] = await Promise.all(
    result.items.map(async (v) => {
      const priv = canCost
        ? await db.vehicle.findUnique({
            where: { id: v.id },
            select: { purchasePrice: true, refurbishmentCost: true },
          })
        : null;
      return {
        id: v.id,
        stockId: v.stockId,
        title: vehicleTitle(v),
        variant: v.variant,
        year: v.year,
        kmDriven: v.kmDriven,
        fuelType: v.fuelType,
        transmission: v.transmission,
        sellingPrice: v.sellingPrice,
        status: v.status,
        isFeatured: v.isFeatured,
        branchId: v.branch.id,
        branchName: v.branch.name,
        enquiryCount: v.enquiryCount,
        imageUrl: v.images[0]?.url ?? null,
        days: ageingDays(v),
        margin:
          showMargin && priv
            ? vehicleMargin({
                sellingPrice: v.sellingPrice,
                purchasePrice: priv.purchasePrice,
                refurbishmentCost: priv.refurbishmentCost,
              })
            : null,
      };
    }),
  );

  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name, city: b.city }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Inventory"
        description={`${total} vehicles${user.branchIds.length ? " in your branch" : " across all branches"}`}
        actions={
          <>
            {can(user, PERMISSIONS.REPORTS_EXPORT) && (
              <LinkButton
                href={`/api/export/inventory${buildQuery(queryParams)}`}
                variant="outline"
                size="sm"
              >
                <Download className="size-4" />
                Export
              </LinkButton>
            )}
            {can(user, PERMISSIONS.INVENTORY_CREATE) && (
              <LinkButton href="/inventory/new" size="sm">
                <Plus className="size-4" />
                Add vehicle
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="In stock" value={valueAgg._count._all} tone="brand" />
        <StatCard label="Stock value" value={formatPrice(valueAgg._sum.sellingPrice ?? 0)} tone="info" />
        <StatCard label="Available" value={countFor("available")} tone="success" />
        <StatCard label="Reserved / booked" value={countFor("reserved") + countFor("booked")} tone="warning" />
      </div>

      <Tabs items={tabs} className="mb-4" />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput placeholder="Search stock ID, registration, make…" className="min-w-0 flex-1 sm:max-w-sm" />
        <FilterSheetButton facets={facets} branches={branchOptions} showStatus total={result.total} />
        <div className="ml-auto">
          <SortSelect options={SORTS} />
        </div>
      </div>

      <div className="mb-4">
        <ActiveFilterChips branches={branchOptions} />
      </div>

      <div className="flex gap-6">
        <FilterSidebar facets={facets} branches={branchOptions} showStatus />

        <div className="min-w-0 flex-1">
          {rows.length ? (
            <>
              <InventoryTable
                rows={rows}
                branches={branchOptions}
                canEdit={can(user, PERMISSIONS.INVENTORY_EDIT)}
                canTransfer={can(user, PERMISSIONS.INVENTORY_TRANSFER)}
                canCreate={can(user, PERMISSIONS.INVENTORY_CREATE)}
                showMargin={showMargin}
              />
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath="/inventory"
                params={queryParams}
              />
            </>
          ) : (
            <EmptyState
              icon={<Car className="size-6" />}
              title={total === 0 ? "No vehicles yet" : "No vehicles match these filters"}
              description={
                total === 0
                  ? "Add your first car and it will appear on your public website straight away."
                  : "Try clearing a filter or searching for a different stock ID."
              }
              action={
                total === 0 && can(user, PERMISSIONS.INVENTORY_CREATE) ? (
                  <LinkButton href="/inventory/new">Add your first vehicle</LinkButton>
                ) : (
                  <LinkButton href="/inventory" variant="outline">Clear filters</LinkButton>
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
