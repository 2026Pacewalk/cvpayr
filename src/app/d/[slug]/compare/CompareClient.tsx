"use client";

import * as React from "react";
import Link from "next/link";
import { GitCompare, X, Check, Minus } from "lucide-react";
import { useCompare } from "@/lib/browser-store";
import { getComparisonVehicles, type ComparisonVehicle } from "@/app/actions/public";
import { VehicleImage } from "@/components/VehicleImage";
import { EmptyState, Skeleton, Badge } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { formatPrice, formatKm, vehicleSlug, cn } from "@/lib/utils";
import { FEATURE_GROUPS, VEHICLE_STATUS_META, type VehicleStatus } from "@/lib/constants";

/** Rows are declared once and rendered for every column, so nothing drifts. */
const SPEC_ROWS: { label: string; get: (v: ComparisonVehicle) => React.ReactNode; highlight?: "low" | "high" }[] = [
  { label: "Price", get: (v) => formatPrice(v.sellingPrice), highlight: "low" },
  { label: "Year", get: (v) => v.year, highlight: "high" },
  { label: "Kilometres", get: (v) => formatKm(v.kmDriven), highlight: "low" },
  { label: "Fuel", get: (v) => v.fuelType },
  { label: "Transmission", get: (v) => v.transmission },
  { label: "Body type", get: (v) => v.bodyType },
  { label: "Ownership", get: (v) => `${v.ownership} owner` },
  { label: "Colour", get: (v) => v.colour ?? "-" },
  { label: "Condition", get: (v) => (v.conditionRating ? `${v.conditionRating.toFixed(1)} / 5` : "-"), highlight: "high" },
  { label: "Service history", get: (v) => (v.serviceHistory ? v.serviceHistory.replace(/_/g, " ") : "-") },
  { label: "Keys", get: (v) => v.numberOfKeys },
  { label: "Insurance", get: (v) => (v.insuranceStatus ? v.insuranceStatus.replace(/_/g, " ") : "-") },
  { label: "Registration", get: (v) => v.registrationState ?? "-" },
  { label: "Showroom", get: (v) => v.branch.city },
];

const NUMERIC: Record<string, (v: ComparisonVehicle) => number> = {
  Price: (v) => v.sellingPrice,
  Year: (v) => v.year,
  Kilometres: (v) => v.kmDriven,
  Condition: (v) => v.conditionRating ?? 0,
};

export function CompareClient({ dealerSlug, base }: { dealerSlug: string; base: string }) {
  const compare = useCompare();
  const [vehicles, setVehicles] = React.useState<ComparisonVehicle[] | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getComparisonVehicles(dealerSlug, compare.items).then((v) => {
      if (!cancelled) setVehicles(v);
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, dealerSlug, compare.items]);

  if (!mounted || vehicles === null) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (!vehicles.length) {
    return (
      <EmptyState
        icon={<GitCompare className="size-6" />}
        title="Nothing to compare yet"
        description="Add up to four cars from any listing to see them side by side."
        action={<LinkButton href={`${base}/cars`}>Browse cars</LinkButton>}
      />
    );
  }

  /** Which column wins a numeric row — used to tint the best value. */
  const bestIndex = (label: string) => {
    const getter = NUMERIC[label];
    const row = SPEC_ROWS.find((r) => r.label === label);
    if (!getter || !row?.highlight || vehicles.length < 2) return -1;
    const values = vehicles.map(getter);
    const target = row.highlight === "low" ? Math.min(...values) : Math.max(...values);
    return values.indexOf(target);
  };

  const allFeatures = FEATURE_GROUPS.flatMap((g) => g.features).filter((f) =>
    vehicles.some((v) => v.featureList.includes(f.key)),
  );

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-32 bg-white text-left align-bottom sm:w-40" />
            {vehicles.map((v) => {
              const status = VEHICLE_STATUS_META[v.status as VehicleStatus];
              return (
                <th key={v.id} className="p-2 align-bottom" style={{ width: `${70 / vehicles.length}%` }}>
                  <div className="relative rounded-[12px] border border-ink-200 bg-white p-3 text-left">
                    <button
                      onClick={() => compare.remove(v.id)}
                      aria-label={`Remove ${v.make} ${v.model}`}
                      className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-white/90 text-ink-400 shadow-sm hover:text-danger-600"
                    >
                      <X className="size-3.5" />
                    </button>
                    <Link href={`${base}/cars/${vehicleSlug(v)}`}>
                      <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-ink-100">
                        <VehicleImage src={v.images[0]?.url} alt={`${v.make} ${v.model}`} className="size-full" />
                      </div>
                      <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug font-semibold text-ink-950">
                        {v.year} {v.make} {v.model}
                      </p>
                      {v.variant && (
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-500">{v.variant}</p>
                      )}
                      <p className="mt-1.5 font-display text-[15px] font-semibold text-ink-950">
                        {formatPrice(v.sellingPrice)}
                      </p>
                      {v.status !== "available" && (
                        <div className="mt-1.5">
                          <Badge tone={status.tone} size="sm">{status.label}</Badge>
                        </div>
                      )}
                    </Link>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          <SectionRow label="Specifications" span={vehicles.length + 1} />
          {SPEC_ROWS.map((row) => {
            const best = bestIndex(row.label);
            return (
              <tr key={row.label} className="border-b border-ink-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white py-2.5 pr-3 text-left text-[12.5px] font-medium text-ink-500"
                >
                  {row.label}
                </th>
                {vehicles.map((v, i) => (
                  <td
                    key={v.id}
                    className={cn(
                      "px-2 py-2.5 text-center text-[13px] text-ink-800",
                      i === best && "font-semibold text-success-700",
                    )}
                  >
                    {row.get(v)}
                  </td>
                ))}
              </tr>
            );
          })}

          {allFeatures.length > 0 && (
            <>
              <SectionRow label="Features" span={vehicles.length + 1} />
              {allFeatures.map((f) => (
                <tr key={f.key} className="border-b border-ink-100">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white py-2.5 pr-3 text-left text-[12.5px] font-medium text-ink-500"
                  >
                    {f.label}
                  </th>
                  {vehicles.map((v) => (
                    <td key={v.id} className="px-2 py-2.5 text-center">
                      {v.featureList.includes(f.key) ? (
                        <Check className="mx-auto size-4 text-success-600" />
                      ) : (
                        <Minus className="mx-auto size-4 text-ink-300" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}
        </tbody>

        <tfoot>
          <tr>
            <td className="sticky left-0 bg-white" />
            {vehicles.map((v) => (
              <td key={v.id} className="p-2 pt-4">
                <Link
                  href={`${base}/cars/${vehicleSlug(v)}`}
                  className="inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-ink-900 text-[13px] font-medium text-white hover:bg-ink-800"
                >
                  View details
                </Link>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="pt-6 pb-2">
        <p className="field-label">{label}</p>
      </td>
    </tr>
  );
}
