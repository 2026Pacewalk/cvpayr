import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Zap, Link2, ExternalLink } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeCost } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listVehicles, parseVehicleFilters, ageingDays } from "@/server/inventory";
import { PageHeader, Card, Badge } from "@/components/ui/primitives";
import { QuickMatch, type MatchRow } from "@/components/crm/QuickMatch";
import { QuickMatchFilters } from "@/components/crm/QuickMatchFilters";
import { vehicleTitle, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Quick Match" };
export const dynamic = "force-dynamic";

export default async function QuickSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.INVENTORY_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const filters = parseVehicleFilters({ ...sp, status: "in_stock" });

  const [result, branches, recentCatalogs] = await Promise.all([
    listVehicles(filters, {
      dealerId: user.dealerId,
      allowedBranchIds: user.branchIds.length ? user.branchIds : undefined,
      pageSize: 60,
    }),
    db.branch.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
    can(user, PERMISSIONS.CATALOG_SHARE)
      ? db.sharedCatalog.findMany({
          where: { dealerId: user.dealerId },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            _count: { select: { items: true } },
            createdBy: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const showCost = canSeeCost(user);
  const ids = result.items.map((v) => v.id);
  const privateData = showCost
    ? await db.vehicle.findMany({
        where: { id: { in: ids } },
        select: { id: true, minAcceptablePrice: true },
      })
    : [];
  const minPriceById = new Map(privateData.map((p) => [p.id, p.minAcceptablePrice]));

  const rows: MatchRow[] = result.items.map((v) => ({
    id: v.id,
    stockId: v.stockId,
    title: vehicleTitle(v),
    variant: v.variant,
    sellingPrice: v.sellingPrice,
    minAcceptablePrice: minPriceById.get(v.id) ?? null,
    kmDriven: v.kmDriven,
    fuelType: v.fuelType,
    transmission: v.transmission,
    bodyType: v.bodyType,
    year: v.year,
    status: v.status,
    branchName: v.branch.name,
    imageUrl: v.images[0]?.url ?? null,
    days: ageingDays(v),
  }));

  return (
    <div className="mx-auto max-w-[1400px] pb-24">
      <PageHeader
        title="Quick Match"
        description="Customer on the phone? Type what they want, pick the best cars, send them one link."
      />

      <Card className="mb-5">
        <QuickMatchFilters branches={branches} resultCount={result.total} />
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          <span className="font-semibold text-ink-900">{result.total}</span> matching{" "}
          {result.total === 1 ? "car" : "cars"} in stock
        </p>
        <p className="hidden text-[12.5px] text-ink-400 sm:block">
          Tap a card to add it to the shortlist
        </p>
      </div>

      <QuickMatch
        rows={rows}
        dealerSlug={user.dealerSlug}
        canShare={can(user, PERMISSIONS.CATALOG_SHARE)}
        showMinPrice={showCost}
      />

      {recentCatalogs.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-display text-[16px] font-semibold text-ink-950">
            Recently shared shortlists
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentCatalogs.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink-950">{c.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-400">
                      {c._count.items} cars · {relativeTime(c.createdAt)}
                      {c.createdBy && ` · ${c.createdBy.name.split(" ")[0]}`}
                    </p>
                  </div>
                  <Badge tone={c.viewCount > 0 ? "success" : "neutral"} size="sm">
                    {c.viewCount} view{c.viewCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                {c.customerName && (
                  <p className="mt-2 text-[12px] text-ink-500">For {c.customerName}</p>
                )}
                {user.dealerSlug && (
                  <Link
                    href={`/d/${user.dealerSlug}/c/${c.code}`}
                    target="_blank"
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Open link
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
