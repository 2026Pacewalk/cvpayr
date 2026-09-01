"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/form";
import { formatPrice } from "@/lib/utils";

/** Quick-find bar on the showroom homepage. Compiles straight into /cars filters. */
export function HeroSearch({
  base,
  makes,
  fuels,
  branches,
  priceMax,
}: {
  base: string;
  makes: { value: string; count: number }[];
  fuels: { value: string; count: number }[];
  branches: { id: string; name: string; city: string }[];
  priceMax: number;
}) {
  const router = useRouter();
  const [make, setMake] = React.useState("");
  const [fuel, setFuel] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [budget, setBudget] = React.useState("");

  const budgets = [300000, 500000, 800000, 1200000, 2000000, Math.max(2500000, priceMax)];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (make) params.set("make", make);
    if (fuel) params.set("fuel", fuel);
    if (branch) params.set("branch", branch);
    if (budget) params.set("priceMax", budget);
    router.push(`${base}/cars?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-[16px] border border-white/15 bg-white/95 p-3 shadow-xl backdrop-blur-sm sm:p-4"
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-1">
          <span className="sr-only">Brand</span>
          <Select value={make} onChange={(e) => setMake(e.target.value)} aria-label="Brand">
            <option value="">Any brand</option>
            {makes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.value} ({m.count})
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className="sr-only">Budget</span>
          <Select value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Budget">
            <option value="">Any budget</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                Under {formatPrice(b)}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className="sr-only">Fuel type</span>
          <Select value={fuel} onChange={(e) => setFuel(e.target.value)} aria-label="Fuel type">
            <option value="">Any fuel</option>
            {fuels.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className="sr-only">Showroom</span>
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Showroom">
            <option value="">All showrooms</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.city}
              </option>
            ))}
          </Select>
        </label>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-ink-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-ink-800 sm:col-span-2 lg:col-span-1"
        >
          <Search className="size-4" />
          Search cars
        </button>
      </div>
    </form>
  );
}
