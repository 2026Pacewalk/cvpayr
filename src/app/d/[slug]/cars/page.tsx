import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Car } from "lucide-react";
import { getDealerBySlug } from "@/server/dealer";
import { listVehicles, parseVehicleFilters, vehicleFacets } from "@/server/inventory";
import { PublicVehicleCard } from "@/components/VehicleCard";
import { EmptyState } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/Table";
import { SearchInput } from "@/components/ui/SearchInput";
import { LinkButton } from "@/components/ui/Button";
import {
  FilterSidebar, FilterSheetButton, SortSelect, ActiveFilterChips,
} from "@/components/public/CarFilters";
import { SORT_OPTIONS } from "@/lib/constants";
import { vehicleSlug } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Cars in stock",
  description: "Browse the full pre-owned inventory across all showrooms.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const base = `/d/${dealer.slug}`;
  const filters = parseVehicleFilters(sp);
  const opts = { dealerId: dealer.id, publicOnly: true as const };

  const [result, facets] = await Promise.all([
    listVehicles(filters, { ...opts, pageSize: 12 }),
    vehicleFacets(opts),
  ]);

  const branches = dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }));
  const queryParams = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-display text-[26px] leading-tight font-semibold text-ink-950 sm:text-[32px]">
          {filters.make ? `${filters.make} cars` : "Cars in stock"}
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-500">
          {result.total} vehicle{result.total === 1 ? "" : "s"} across {dealer.branches.length}{" "}
          showroom{dealer.branches.length === 1 ? "" : "s"} — every one inspected before listing.
        </p>
      </header>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <SearchInput
          placeholder="Search make, model or variant…"
          className="min-w-0 flex-1 sm:max-w-sm"
        />
        <FilterSheetButton facets={facets} branches={branches} total={result.total} />
        <div className="ml-auto">
          <SortSelect options={SORT_OPTIONS} />
        </div>
      </div>

      <div className="mb-5">
        <ActiveFilterChips branches={branches} />
      </div>

      <div className="flex gap-6">
        <FilterSidebar facets={facets} branches={branches} />

        <div className="min-w-0 flex-1">
          {result.items.length ? (
            <>
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 xl:grid-cols-3">
                {result.items.map((v, i) => (
                  <PublicVehicleCard
                    key={v.id}
                    vehicle={v}
                    href={`${base}/cars/${vehicleSlug(v)}`}
                    priority={i < 3}
                  />
                ))}
              </div>
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath={`${base}/cars`}
                params={queryParams}
              />
            </>
          ) : (
            <EmptyState
              icon={<Car className="size-6" />}
              title="No cars match those filters"
              description="Try widening your budget or clearing a filter or two. New stock arrives every week."
              action={
                <LinkButton href={`${base}/cars`} variant="outline">
                  Clear all filters
                </LinkButton>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
