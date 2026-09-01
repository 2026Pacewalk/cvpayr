import Link from "next/link";
import { Fuel, Gauge, Settings2, MapPin, Camera, Users } from "lucide-react";
import { VehicleImage } from "./VehicleImage";
import { OverlayBadge, Badge } from "./ui/primitives";
import { VEHICLE_STATUS_META, type VehicleStatus, ageingBucket } from "@/lib/constants";
import { cn, formatPrice, formatKm, vehicleTitle, daysBetween } from "@/lib/utils";
import type { VehicleCard as VehicleCardData } from "@/server/inventory";
import { FavouriteButton } from "./FavouriteButton";

/** Public showroom card. */
export function PublicVehicleCard({
  vehicle,
  href,
  priority,
  className,
}: {
  vehicle: VehicleCardData;
  href: string;
  priority?: boolean;
  className?: string;
}) {
  const status = VEHICLE_STATUS_META[vehicle.status as VehicleStatus];
  const cover = vehicle.images[0]?.url ?? null;
  const title = vehicleTitle(vehicle);
  const saving =
    vehicle.originalPrice && vehicle.originalPrice > vehicle.sellingPrice
      ? vehicle.originalPrice - vehicle.sellingPrice
      : null;

  return (
    <article
      className={cn(
        // Corner radius comes from the active showroom template, so a card in
        // Metro is near-square and the same card in Kinetic is fully rounded.
        "tpl-card group relative overflow-hidden border border-ink-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
          <VehicleImage
            src={cover}
            alt={title}
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="size-full transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="flex flex-wrap gap-1.5">
              {vehicle.status !== "available" && (
                <OverlayBadge tone={status.tone}>{status.label}</OverlayBadge>
              )}
              {vehicle.isFeatured && vehicle.status === "available" && (
                <OverlayBadge tone="brand">Featured</OverlayBadge>
              )}
            </div>
          </div>
          {vehicle._count.images > 1 && (
            <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <Camera className="size-3" />
              {vehicle._count.images}
            </span>
          )}
        </div>
      </Link>

      <div className="absolute top-2.5 right-2.5">
        <FavouriteButton vehicleId={vehicle.id} />
      </div>

      <div className="p-4">
        <Link href={href}>
          <h3 className="line-clamp-1 text-[15px] font-semibold text-ink-950 transition-colors group-hover:text-brand-700">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h3>
        </Link>
        {vehicle.variant && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-500">{vehicle.variant}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3.5 text-ink-400" />
            {formatKm(vehicle.kmDriven)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Fuel className="size-3.5 text-ink-400" />
            {vehicle.fuelType}
          </span>
          <span className="inline-flex items-center gap-1">
            <Settings2 className="size-3.5 text-ink-400" />
            {vehicle.transmission}
          </span>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-3 border-t border-ink-100 pt-3.5">
          <div>
            <p className="font-display text-[19px] leading-none font-semibold text-ink-950">
              {formatPrice(vehicle.sellingPrice)}
            </p>
            {saving && (
              <p className="mt-1 text-[11.5px] text-ink-400">
                <span className="line-through">{formatPrice(vehicle.originalPrice)}</span>{" "}
                <span className="font-medium text-success-700">
                  save {formatPrice(saving)}
                </span>
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-right text-[11.5px] text-ink-400">
            <MapPin className="size-3" />
            {vehicle.branch.city}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Compact horizontal card — used in shared catalogs and similar-car strips. */
export function VehicleRowCard({
  vehicle,
  href,
  note,
}: {
  vehicle: VehicleCardData;
  href: string;
  note?: string | null;
}) {
  const cover = vehicle.images[0]?.url ?? null;
  return (
    <Link
      href={href}
      className="group flex gap-3 overflow-hidden rounded-[12px] border border-ink-200 bg-white p-2.5 transition-shadow hover:shadow-md"
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-[9px] bg-ink-100 sm:size-28">
        <VehicleImage src={cover} alt={vehicleTitle(vehicle)} className="size-full" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="line-clamp-1 text-[14px] font-semibold text-ink-950 group-hover:text-brand-700">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h3>
        {vehicle.variant && (
          <p className="line-clamp-1 text-[12px] text-ink-500">{vehicle.variant}</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-ink-500">
          <span>{formatKm(vehicle.kmDriven)}</span>
          <span className="text-ink-300">·</span>
          <span>{vehicle.fuelType}</span>
          <span className="text-ink-300">·</span>
          <span>{vehicle.transmission}</span>
        </div>
        <p className="mt-1.5 font-display text-[15px] font-semibold text-ink-950">
          {formatPrice(vehicle.sellingPrice)}
        </p>
        {note && <p className="mt-1 text-[11.5px] text-brand-700">{note}</p>}
      </div>
    </Link>
  );
}

/** CRM inventory card — surfaces stock id, ageing and enquiry pressure. */
export function StockCard({
  vehicle,
  href,
  showCost,
  cost,
}: {
  vehicle: VehicleCardData;
  href: string;
  showCost?: boolean;
  cost?: { profit: number; marginPct: number } | null;
}) {
  const status = VEHICLE_STATUS_META[vehicle.status as VehicleStatus];
  const days = daysBetween(vehicle.listedAt ?? vehicle.createdAt);
  const bucket = ageingBucket(days);

  return (
    <Link
      href={href}
      className="group flex gap-3 overflow-hidden rounded-[12px] border border-ink-200 bg-white p-3 transition-shadow hover:shadow-md"
    >
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
        <VehicleImage src={vehicle.images[0]?.url ?? null} alt={vehicleTitle(vehicle)} className="size-full" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-ink-400">{vehicle.stockId}</p>
            <h3 className="line-clamp-1 text-[14px] font-semibold text-ink-950 group-hover:text-brand-700">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h3>
            {vehicle.variant && (
              <p className="line-clamp-1 text-[11.5px] text-ink-500">{vehicle.variant}</p>
            )}
          </div>
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
          <span className="font-display text-[14px] font-semibold text-ink-950">
            {formatPrice(vehicle.sellingPrice)}
          </span>
          <span>{formatKm(vehicle.kmDriven)}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {vehicle.branch.name}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={bucket.tone} size="sm">
            {days}d in stock
          </Badge>
          {vehicle.enquiryCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-500">
              <Users className="size-3" />
              {vehicle.enquiryCount} enquir{vehicle.enquiryCount === 1 ? "y" : "ies"}
            </span>
          )}
          {showCost && cost && (
            <Badge tone={cost.profit > 0 ? "success" : "danger"} size="sm">
              {formatPrice(cost.profit)} · {cost.marginPct}%
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
