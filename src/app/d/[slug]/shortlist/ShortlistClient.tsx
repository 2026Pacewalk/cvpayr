"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, Clock, Trash2 } from "lucide-react";
import { useFavourites, useRecentlyViewed } from "@/lib/browser-store";
import { getPublicVehiclesByIds } from "@/app/actions/public";
import { PublicVehicleCard } from "@/components/VehicleCard";
import { EmptyState, SkeletonCard } from "@/components/ui/primitives";
import { LinkButton, Button } from "@/components/ui/Button";
import { vehicleSlug } from "@/lib/utils";
import type { VehicleCard } from "@/server/inventory";

export function ShortlistClient({ dealerSlug, base }: { dealerSlug: string; base: string }) {
  const favourites = useFavourites();
  const recent = useRecentlyViewed();
  const [saved, setSaved] = React.useState<VehicleCard[] | null>(null);
  const [viewed, setViewed] = React.useState<VehicleCard[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      const [s, r] = await Promise.all([
        getPublicVehiclesByIds(dealerSlug, favourites.items),
        getPublicVehiclesByIds(
          dealerSlug,
          recent.items.filter((id) => !favourites.items.includes(id)),
        ),
      ]);
      if (!cancelled) {
        setSaved(s);
        setViewed(r);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, dealerSlug, favourites.items, recent.items]);

  if (!mounted || saved === null) {
    return (
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-[18px] font-semibold text-ink-950">
            Saved cars{saved.length > 0 && <span className="ml-2 text-ink-400">{saved.length}</span>}
          </h2>
          {saved.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => favourites.clear()}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        {saved.length ? (
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">
            {saved.map((v) => (
              <PublicVehicleCard key={v.id} vehicle={v} href={`${base}/cars/${vehicleSlug(v)}`} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Heart className="size-6" />}
            title="Nothing saved yet"
            description="Tap the heart on any car to keep it here while you decide."
            action={<LinkButton href={`${base}/cars`}>Browse cars</LinkButton>}
          />
        )}
      </section>

      {viewed.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-[18px] font-semibold text-ink-950">
            <Clock className="size-4 text-ink-400" />
            Recently viewed
          </h2>
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">
            {viewed.map((v) => (
              <PublicVehicleCard key={v.id} vehicle={v} href={`${base}/cars/${vehicleSlug(v)}`} />
            ))}
          </div>
        </section>
      )}

      <div className="rounded-[16px] border border-ink-200 bg-ink-50 p-6 text-center">
        <p className="text-[14px] text-ink-600">
          Shortlisted a few? Send them to us and we will hold them for your visit.
        </p>
        <Link
          href={`${base}/contact`}
          className="mt-4 inline-flex h-11 items-center rounded-[10px] bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-ink-800"
        >
          Talk to our team
        </Link>
      </div>
    </div>
  );
}
