"use server";

import { db } from "@/lib/db";
import { PUBLIC_VEHICLE_STATUSES } from "@/lib/constants";
import { vehicleCardSelect } from "@/server/inventory";
import { safeJsonParse } from "@/lib/utils";

/** Resolves visitor-side lists (shortlist, compare, recently viewed) into vehicles. */
export async function getPublicVehiclesByIds(dealerSlug: string, ids: string[]) {
  if (!ids.length) return [];
  const dealer = await db.dealer.findUnique({ where: { slug: dealerSlug }, select: { id: true } });
  if (!dealer) return [];

  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId: dealer.id,
      id: { in: ids.slice(0, 24) },
      status: { in: [...PUBLIC_VEHICLE_STATUSES] },
    },
    select: vehicleCardSelect,
  });

  // Preserve the order the visitor saved them in.
  const order = new Map(ids.map((id, i) => [id, i]));
  return vehicles.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export type ComparisonVehicle = Awaited<ReturnType<typeof getComparisonVehicles>>[number];

/** Full spec payload for the side-by-side compare table. */
export async function getComparisonVehicles(dealerSlug: string, ids: string[]) {
  if (!ids.length) return [];
  const dealer = await db.dealer.findUnique({ where: { slug: dealerSlug }, select: { id: true } });
  if (!dealer) return [];

  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId: dealer.id,
      id: { in: ids.slice(0, 4) },
      status: { in: [...PUBLIC_VEHICLE_STATUSES] },
    },
    select: {
      id: true, stockId: true, make: true, model: true, variant: true, year: true,
      registrationYear: true, fuelType: true, transmission: true, bodyType: true,
      colour: true, ownership: true, kmDriven: true, sellingPrice: true, originalPrice: true,
      negotiable: true, status: true, conditionRating: true, serviceHistory: true,
      numberOfKeys: true, insuranceStatus: true, registrationState: true, features: true,
      branch: { select: { name: true, city: true } },
      images: {
        select: { url: true },
        where: { kind: "photo" },
        orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
        take: 1,
      },
    },
  });

  const order = new Map(ids.map((id, i) => [id, i]));
  return vehicles
    .map((v) => ({ ...v, featureList: safeJsonParse<string[]>(v.features, []) }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
