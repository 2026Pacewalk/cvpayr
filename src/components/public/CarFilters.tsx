"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Select, Field } from "@/components/ui/form";
import { cn, formatPrice } from "@/lib/utils";
import { OWNERSHIP_OPTIONS, PRICE_BUCKETS } from "@/lib/constants";

export type Facets = {
  makes: { value: string; count: number }[];
  fuels: { value: string; count: number }[];
  bodyTypes: { value: string; count: number }[];
  transmissions: { value: string; count: number }[];
  colours: { value: string; count: number }[];
  priceMin: number;
  priceMax: number;
  yearMin: number;
  yearMax: number;
  kmMax: number;
};

type Branch = { id: string; name: string; city: string };

/** Multi-value params are stored comma separated so URLs stay short and shareable. */
function toggleInList(current: string | null, value: string) {
  const list = current ? current.split(",").filter(Boolean) : [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return next.length ? next.join(",") : null;
}

function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { searchParams, setParam, pathname, router };
}

/** Count of filters currently applied — drives the mobile badge. */
export function activeFilterCount(params: URLSearchParams) {
  const keys = [
    "make", "model", "fuel", "transmission", "bodyType", "colour", "branch",
    "ownership", "priceMin", "priceMax", "yearMin", "yearMax", "kmMax", "featured",
  ];
  return keys.filter((k) => params.get(k)).length;
}

function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-ink-100 py-4 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-[13px] font-semibold text-ink-900">{title}</span>
        <span className={cn("text-ink-400 transition-transform", open && "rotate-45")}>+</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 select-none">
      <span className="flex min-w-0 items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="size-[17px] shrink-0 rounded-[5px] border-ink-300 accent-brand-600"
        />
        <span className="truncate text-[13px] text-ink-700">{label}</span>
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-[11.5px] text-ink-400 tabular-nums">{count}</span>
      )}
    </label>
  );
}

export function FilterPanel({
  facets,
  branches,
  showStatus,
}: {
  facets: Facets;
  branches: Branch[];
  showStatus?: boolean;
}) {
  const { searchParams, setParam } = useFilterNav();
  const g = (k: string) => searchParams.get(k);
  const inList = (k: string, v: string) => (g(k) ?? "").split(",").includes(v);

  const [priceMin, setPriceMin] = React.useState(g("priceMin") ?? "");
  const [priceMax, setPriceMax] = React.useState(g("priceMax") ?? "");
  const [kmMax, setKmMax] = React.useState(g("kmMax") ?? "");

  React.useEffect(() => {
    setPriceMin(g("priceMin") ?? "");
    setPriceMax(g("priceMax") ?? "");
    setKmMax(g("kmMax") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const years = React.useMemo(() => {
    const out: number[] = [];
    for (let y = facets.yearMax; y >= facets.yearMin; y--) out.push(y);
    return out;
  }, [facets.yearMin, facets.yearMax]);

  return (
    <div>
      <FilterGroup title="Budget">
        <div className="flex flex-wrap gap-2">
          {PRICE_BUCKETS.map((b) => {
            const active = g("priceMin") === String(b.min) && g("priceMax") === String(b.max);
            return (
              <button
                key={b.label}
                type="button"
                onClick={() =>
                  setParam(
                    active
                      ? { priceMin: null, priceMax: null }
                      : { priceMin: String(b.min), priceMax: String(b.max) },
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            onBlur={() => setParam({ priceMin: priceMin || null })}
            placeholder={String(facets.priceMin)}
            aria-label="Minimum price"
            className="h-9 w-full rounded-[8px] border border-ink-200 px-2.5 text-[13px] focus:border-brand-500 focus:outline-none"
          />
          <span className="text-ink-400">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            onBlur={() => setParam({ priceMax: priceMax || null })}
            placeholder={String(facets.priceMax)}
            aria-label="Maximum price"
            className="h-9 w-full rounded-[8px] border border-ink-200 px-2.5 text-[13px] focus:border-brand-500 focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-400">
          Stock ranges {formatPrice(facets.priceMin)} – {formatPrice(facets.priceMax)}
        </p>
      </FilterGroup>

      {branches.length > 1 && (
        <FilterGroup title="Showroom">
          {branches.map((b) => (
            <CheckRow
              key={b.id}
              label={`${b.city} — ${b.name}`}
              checked={g("branch") === b.id}
              onChange={() => setParam({ branch: g("branch") === b.id ? null : b.id })}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Brand">
        <div className="thin-scrollbar max-h-56 overflow-y-auto pr-1">
          {facets.makes.map((m) => (
            <CheckRow
              key={m.value}
              label={m.value}
              count={m.count}
              checked={g("make") === m.value}
              onChange={() => setParam({ make: g("make") === m.value ? null : m.value })}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Body type">
        {facets.bodyTypes.map((b) => (
          <CheckRow
            key={b.value}
            label={b.value}
            count={b.count}
            checked={inList("bodyType", b.value)}
            onChange={() => setParam({ bodyType: toggleInList(g("bodyType"), b.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Fuel">
        {facets.fuels.map((f) => (
          <CheckRow
            key={f.value}
            label={f.value}
            count={f.count}
            checked={inList("fuel", f.value)}
            onChange={() => setParam({ fuel: toggleInList(g("fuel"), f.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Transmission">
        {facets.transmissions.map((t) => (
          <CheckRow
            key={t.value}
            label={t.value}
            count={t.count}
            checked={inList("transmission", t.value)}
            onChange={() => setParam({ transmission: toggleInList(g("transmission"), t.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Year" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Select
              value={g("yearMin") ?? ""}
              onChange={(e) => setParam({ yearMin: e.target.value || null })}
            >
              <option value="">Any</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select
              value={g("yearMax") ?? ""}
              onChange={(e) => setParam({ yearMax: e.target.value || null })}
            >
              <option value="">Any</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>
        </div>
      </FilterGroup>

      <FilterGroup title="Kilometres driven" defaultOpen={false}>
        <input
          type="range"
          min={0}
          max={facets.kmMax}
          step={5000}
          value={kmMax || facets.kmMax}
          onChange={(e) => setKmMax(e.target.value)}
          onMouseUp={() => setParam({ kmMax: kmMax || null })}
          onTouchEnd={() => setParam({ kmMax: kmMax || null })}
          className="w-full"
          aria-label="Maximum kilometres"
        />
        <p className="mt-2 text-[12.5px] text-ink-500">
          Up to{" "}
          <span className="font-medium text-ink-800 tabular-nums">
            {new Intl.NumberFormat("en-IN").format(Number(kmMax || facets.kmMax))} km
          </span>
        </p>
      </FilterGroup>

      <FilterGroup title="Ownership" defaultOpen={false}>
        {OWNERSHIP_OPTIONS.map((o) => (
          <CheckRow
            key={o.value}
            label={`${o.label} or fewer`}
            checked={g("ownership") === String(o.value)}
            onChange={() =>
              setParam({ ownership: g("ownership") === String(o.value) ? null : String(o.value) })
            }
          />
        ))}
      </FilterGroup>

      {facets.colours.length > 0 && (
        <FilterGroup title="Colour" defaultOpen={false}>
          <div className="thin-scrollbar max-h-44 overflow-y-auto pr-1">
            {facets.colours.map((c) => (
              <CheckRow
                key={c.value}
                label={c.value}
                count={c.count}
                checked={g("colour") === c.value}
                onChange={() => setParam({ colour: g("colour") === c.value ? null : c.value })}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      {showStatus && (
        <FilterGroup title="Availability" defaultOpen={false}>
          {[
            { v: "available", l: "Available now" },
            { v: "reserved", l: "Reserved" },
            { v: "booked", l: "Booked" },
          ].map((s) => (
            <CheckRow
              key={s.v}
              label={s.l}
              checked={g("status") === s.v}
              onChange={() => setParam({ status: g("status") === s.v ? null : s.v })}
            />
          ))}
        </FilterGroup>
      )}
    </div>
  );
}

/** Desktop sidebar wrapper. */
export function FilterSidebar(props: { facets: Facets; branches: Branch[]; showStatus?: boolean }) {
  const { searchParams, setParam } = useFilterNav();
  const count = activeFilterCount(searchParams);

  const clearAll = () => {
    const keys = [
      "make", "model", "fuel", "transmission", "bodyType", "colour", "branch",
      "ownership", "priceMin", "priceMax", "yearMin", "yearMax", "kmMax", "featured", "status",
    ];
    setParam(Object.fromEntries(keys.map((k) => [k, null])));
  };

  return (
    <aside className="hidden w-[264px] shrink-0 lg:block">
      <div className="sticky top-20 rounded-[14px] border border-ink-200 bg-white p-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <h2 className="text-[14px] font-semibold text-ink-900">Filters</h2>
          {count > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
            >
              <RotateCcw className="size-3" />
              Clear ({count})
            </button>
          )}
        </div>
        <div className="thin-scrollbar max-h-[calc(100dvh-11rem)] overflow-y-auto">
          <FilterPanel {...props} />
        </div>
      </div>
    </aside>
  );
}

/** Mobile trigger + bottom sheet. */
export function FilterSheetButton({
  facets,
  branches,
  showStatus,
  total,
}: {
  facets: Facets;
  branches: Branch[];
  showStatus?: boolean;
  total: number;
}) {
  const [open, setOpen] = React.useState(false);
  const { searchParams, setParam } = useFilterNav();
  const count = activeFilterCount(searchParams);

  const clearAll = () => {
    const keys = [
      "make", "model", "fuel", "transmission", "bodyType", "colour", "branch",
      "ownership", "priceMin", "priceMax", "yearMin", "yearMax", "kmMax", "featured", "status",
    ];
    setParam(Object.fromEntries(keys.map((k) => [k, null])));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[13.5px] font-medium text-ink-700 shadow-xs lg:hidden"
      >
        <SlidersHorizontal className="size-4" />
        Filters
        {count > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
            {count}
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter cars"
        size="md"
        footer={
          <div className="flex w-full items-center gap-2">
            <Button variant="outline" size="md" onClick={clearAll} className="shrink-0">
              <X className="size-4" />
              Clear
            </Button>
            <Button size="md" fullWidth onClick={() => setOpen(false)}>
              Show {total} car{total === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        <FilterPanel facets={facets} branches={branches} showStatus={showStatus} />
      </Sheet>
    </>
  );
}

/** Sort control, kept in the URL alongside filters. */
export function SortSelect({ options }: { options: { value: string; label: string }[] }) {
  const { searchParams, setParam } = useFilterNav();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="hidden text-[13px] text-ink-500 sm:inline">Sort</span>
      <select
        value={searchParams.get("sort") ?? "newest"}
        onChange={(e) => setParam({ sort: e.target.value === "newest" ? null : e.target.value })}
        aria-label="Sort results"
        className="h-10 rounded-[10px] border border-ink-200 bg-white px-3 pr-8 text-[13.5px] font-medium text-ink-700 shadow-xs focus:border-brand-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Removable chips summarising the active filters. */
export function ActiveFilterChips({ branches }: { branches: Branch[] }) {
  const { searchParams, setParam } = useFilterNav();
  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [];
  const g = (k: string) => searchParams.get(k);

  if (g("make")) chips.push({ key: "make", label: g("make")!, clear: { make: null } });
  if (g("model")) chips.push({ key: "model", label: g("model")!, clear: { model: null } });
  for (const key of ["bodyType", "fuel", "transmission"] as const) {
    const value = g(key);
    if (value)
      value.split(",").filter(Boolean).forEach((v) =>
        chips.push({ key: `${key}-${v}`, label: v, clear: { [key]: toggleInList(value, v) } }),
      );
  }
  if (g("colour")) chips.push({ key: "colour", label: g("colour")!, clear: { colour: null } });
  if (g("branch")) {
    const b = branches.find((x) => x.id === g("branch"));
    if (b) chips.push({ key: "branch", label: b.city, clear: { branch: null } });
  }
  if (g("priceMin") || g("priceMax")) {
    chips.push({
      key: "price",
      label: `${g("priceMin") ? formatPrice(Number(g("priceMin"))) : "Any"} – ${g("priceMax") ? formatPrice(Number(g("priceMax"))) : "Any"}`,
      clear: { priceMin: null, priceMax: null },
    });
  }
  if (g("yearMin") || g("yearMax")) {
    chips.push({
      key: "year",
      label: `${g("yearMin") ?? "Any"} – ${g("yearMax") ?? "Any"}`,
      clear: { yearMin: null, yearMax: null },
    });
  }
  if (g("kmMax")) {
    chips.push({
      key: "km",
      label: `Under ${new Intl.NumberFormat("en-IN").format(Number(g("kmMax")))} km`,
      clear: { kmMax: null },
    });
  }
  if (g("ownership")) {
    chips.push({ key: "own", label: `${g("ownership")} owner or fewer`, clear: { ownership: null } });
  }
  if (g("featured")) chips.push({ key: "featured", label: "Featured", clear: { featured: null } });

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => setParam(c.clear)}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white py-1 pr-2 pl-3 text-[12.5px] font-medium text-ink-700 hover:border-ink-300"
        >
          {c.label}
          <X className="size-3.5 text-ink-400" />
        </button>
      ))}
      <button
        onClick={() =>
          setParam(
            Object.fromEntries(
              ["make", "model", "fuel", "transmission", "bodyType", "colour", "branch",
                "ownership", "priceMin", "priceMax", "yearMin", "yearMax", "kmMax", "featured"]
                .map((k) => [k, null]),
            ),
          )
        }
        className="text-[12.5px] font-medium text-brand-700 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
