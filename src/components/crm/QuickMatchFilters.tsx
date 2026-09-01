"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, RotateCcw } from "lucide-react";
import { Field, Select, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/Button";
import { FUEL_TYPES, TRANSMISSIONS, BODY_TYPES, PRICE_BUCKETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Requirement capture for the Quick Match tool — deliberately shaped like the
 * sentence a customer actually says: "automatic SUV, petrol, under 12 lakh".
 */
export function QuickMatchFilters({
  branches,
  resultCount,
}: {
  branches: { id: string; name: string; city: string }[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();

  const set = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const g = (k: string) => searchParams.get(k) ?? "";
  const clear = () => router.replace(pathname);
  const activeCount = ["priceMax", "priceMin", "bodyType", "fuel", "transmission", "branch", "q", "yearMin"]
    .filter((k) => searchParams.get(k)).length;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Budget up to">
          <Select value={g("priceMax")} onChange={(e) => set({ priceMax: e.target.value })}>
            <option value="">Any budget</option>
            {PRICE_BUCKETS.map((b) => (
              <option key={b.max} value={b.max}>
                Under {b.label.replace("Under ", "").replace("Above ", "")}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Body type">
          <Select value={g("bodyType")} onChange={(e) => set({ bodyType: e.target.value })}>
            <option value="">Any body type</option>
            {BODY_TYPES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>

        <Field label="Fuel">
          <Select value={g("fuel")} onChange={(e) => set({ fuel: e.target.value })}>
            <option value="">Any fuel</option>
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </Field>

        <Field label="Transmission">
          <Select value={g("transmission")} onChange={(e) => set({ transmission: e.target.value })}>
            <option value="">Any transmission</option>
            {TRANSMISSIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>

        <Field label="Branch">
          <Select value={g("branch")} onChange={(e) => set({ branch: e.target.value })}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Year from">
          <Select value={g("yearMin")} onChange={(e) => set({ yearMin: e.target.value })}>
            <option value="">Any year</option>
            {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y} or newer</option>
            ))}
          </Select>
        </Field>

        <Field label="Kilometres under">
          <Select value={g("kmMax")} onChange={(e) => set({ kmMax: e.target.value })}>
            <option value="">Any</option>
            {[20000, 40000, 60000, 80000, 100000].map((km) => (
              <option key={km} value={km}>
                {new Intl.NumberFormat("en-IN").format(km)} km
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Keyword">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              defaultValue={g("q")}
              onChange={(e) => {
                const value = e.target.value;
                window.clearTimeout((window as unknown as { __qm?: number }).__qm);
                (window as unknown as { __qm?: number }).__qm = window.setTimeout(
                  () => set({ q: value }),
                  350,
                );
              }}
              placeholder="Creta, Nexon…"
              className="pl-9"
            />
          </div>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <p className={cn("text-[13px]", resultCount ? "text-ink-500" : "text-warning-700")}>
          {resultCount
            ? `${resultCount} car${resultCount === 1 ? "" : "s"} match this requirement`
            : "Nothing matches — try widening the budget"}
        </p>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <RotateCcw className="size-3.5" />
            Reset ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}
