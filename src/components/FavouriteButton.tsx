"use client";

import * as React from "react";
import { Heart, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavourites, useCompare } from "@/lib/browser-store";
import { useToast } from "./ui/Toast";

export function FavouriteButton({
  vehicleId,
  className,
  variant = "overlay",
}: {
  vehicleId: string;
  className?: string;
  variant?: "overlay" | "inline";
}) {
  const { has, toggle } = useFavourites();
  const toast = useToast();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const saved = mounted && has(vehicleId);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(vehicleId);
    if (added) toast.success("Saved to your shortlist");
    else toast.info("Removed from shortlist");
  };

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium transition-colors",
          saved
            ? "border-danger-100 bg-danger-50 text-danger-700"
            : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          className,
        )}
      >
        <Heart className={cn("size-4", saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "Remove from shortlist" : "Save to shortlist"}
      aria-pressed={saved}
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-white/90 text-ink-500 shadow-sm backdrop-blur-sm transition-colors hover:text-danger-600",
        saved && "text-danger-600",
        className,
      )}
    >
      <Heart className={cn("size-4", saved && "fill-current")} />
    </button>
  );
}

export function CompareButton({ vehicleId, className }: { vehicleId: string; className?: string }) {
  const { has, toggle, count } = useCompare();
  const toast = useToast();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const active = mounted && has(vehicleId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        if (!active && count >= 4) {
          toast.warning("Compare holds 4 cars", "Remove one before adding another.");
          return;
        }
        const added = toggle(vehicleId);
        toast.info(added ? "Added to compare" : "Removed from compare");
      }}
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
        className,
      )}
    >
      <GitCompare className="size-4" />
      {active ? "In compare" : "Compare"}
    </button>
  );
}
