import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PUBLIC_VEHICLE_STATUSES, VEHICLE_STATUSES, type VehicleStatus } from "@/lib/constants";
import { daysBetween, safeJsonParse } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* FILTERS                                                             */
/* ------------------------------------------------------------------ */

export type VehicleFilters = {
  q?: string;
  make?: string;
  model?: string;
  variant?: string;
  fuel?: string[];
  transmission?: string[];
  bodyType?: string[];
  colour?: string;
  branchId?: string;
  city?: string;
  status?: string;
  ownership?: number;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  kmMin?: number;
  kmMax?: number;
  featured?: boolean;
  ageingBucket?: string;
  /** Data-quality filter used by the action centre: photos | details. */
  missing?: string;
  /** Document filter used by the action centre: expired | expiring. */
  docs?: string;
  sort?: string;
  page?: number;
};

type ParamsLike = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v || undefined;
}

function many(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  const arr = Array.isArray(v) ? v : v.split(",");
  const cleaned = arr.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = one(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Parses `searchParams` from any page into a validated filter object. */
export function parseVehicleFilters(params: ParamsLike): VehicleFilters {
  return {
    q: one(params.q),
    make: one(params.make),
    model: one(params.model),
    variant: one(params.variant),
    fuel: many(params.fuel),
    transmission: many(params.transmission),
    bodyType: many(params.bodyType),
    colour: one(params.colour),
    branchId: one(params.branch),
    city: one(params.city),
    status: one(params.status),
    ownership: num(params.ownership),
    priceMin: num(params.priceMin),
    priceMax: num(params.priceMax),
    yearMin: num(params.yearMin),
    yearMax: num(params.yearMax),
    kmMin: num(params.kmMin),
    kmMax: num(params.kmMax),
    featured: one(params.featured) === "1",
    ageingBucket: one(params.ageing),
    missing: one(params.missing),
    docs: one(params.docs),
    sort: one(params.sort) ?? "newest",
    page: Math.max(1, num(params.page) ?? 1),
  };
}

const SORTS: Record<string, Prisma.VehicleOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  price_asc: [{ sellingPrice: "asc" }],
  price_desc: [{ sellingPrice: "desc" }],
  km_asc: [{ kmDriven: "asc" }],
  year_desc: [{ year: "desc" }],
  ageing_desc: [{ listedAt: "asc" }],
  oldest: [{ listedAt: "asc" }],
  views: [{ viewCount: "desc" }],
};

export function vehicleOrderBy(sort?: string) {
  return SORTS[sort ?? "newest"] ?? SORTS.newest;
}

/**
 * Builds the Prisma where clause.
 * `dealerId` is always applied — it is the tenant boundary and is never user-supplied.
 */
export function buildVehicleWhere(
  filters: VehicleFilters,
  opts: {
    dealerId: string;
    publicOnly?: boolean;
    /** Restrict to these branches (branch-scoped staff). */
    allowedBranchIds?: string[];
    /** Restrict to these vehicle ids (shared catalog). */
    vehicleIds?: string[];
  },
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { dealerId: opts.dealerId };
  const and: Prisma.VehicleWhereInput[] = [];

  if (opts.publicOnly) {
    where.status = { in: [...PUBLIC_VEHICLE_STATUSES] };
    where.branch = { isActive: true };
  } else if (filters.status && VEHICLE_STATUSES.includes(filters.status as VehicleStatus)) {
    where.status = filters.status;
  } else if (filters.status === "in_stock") {
    where.status = { in: ["available", "reserved", "booked"] };
  }

  if (opts.allowedBranchIds?.length) {
    and.push({ branchId: { in: opts.allowedBranchIds } });
  }
  if (opts.vehicleIds) {
    and.push({ id: { in: opts.vehicleIds } });
  }
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.city) where.branch = { ...(where.branch as object), city: filters.city };

  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { make: { contains: q } },
        { model: { contains: q } },
        { variant: { contains: q } },
        { stockId: { contains: q } },
        { registrationNumber: { contains: q } },
        { colour: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  if (filters.make) where.make = filters.make;
  if (filters.model) where.model = { contains: filters.model };
  if (filters.colour) where.colour = { contains: filters.colour };
  if (filters.fuel?.length) where.fuelType = { in: filters.fuel };
  if (filters.transmission?.length) where.transmission = { in: filters.transmission };
  if (filters.bodyType?.length) where.bodyType = { in: filters.bodyType };
  if (filters.ownership) where.ownership = { lte: filters.ownership };
  if (filters.featured) where.isFeatured = true;

  if (filters.priceMin != null || filters.priceMax != null) {
    where.sellingPrice = {
      ...(filters.priceMin != null ? { gte: filters.priceMin } : {}),
      ...(filters.priceMax != null ? { lte: filters.priceMax } : {}),
    };
  }
  if (filters.yearMin != null || filters.yearMax != null) {
    where.year = {
      ...(filters.yearMin != null ? { gte: filters.yearMin } : {}),
      ...(filters.yearMax != null ? { lte: filters.yearMax } : {}),
    };
  }
  if (filters.kmMin != null || filters.kmMax != null) {
    where.kmDriven = {
      ...(filters.kmMin != null ? { gte: filters.kmMin } : {}),
      ...(filters.kmMax != null ? { lte: filters.kmMax } : {}),
    };
  }

  if (filters.ageingBucket) {
    const now = Date.now();
    const range: Record<string, [number, number]> = {
      "0-15": [0, 15],
      "16-30": [16, 30],
      "31-60": [31, 60],
      "61-90": [61, 90],
      "90+": [91, 100000],
    };
    const bucket = range[filters.ageingBucket];
    if (bucket) {
      const [minDays, maxDays] = bucket;
      and.push({
        listedAt: {
          lte: new Date(now - minDays * 86400000),
          gte: new Date(now - (maxDays + 1) * 86400000),
        },
      });
    }
  }

  // Data-quality filters, so the action centre's cards land on a real list
  // rather than an unfiltered page the user then has to search by eye.
  if (filters.missing === "photos") {
    and.push({ images: { none: { kind: "photo" } } });
  }
  if (filters.missing === "details") {
    and.push({
      OR: [
        { registrationNumber: null },
        { registrationState: null },
        { conditionRating: null },
        { description: null },
      ],
    });
  }

  if (filters.docs === "expired") {
    and.push({
      OR: [
        { insuranceValidTill: { not: null, lt: new Date() } },
        { fitnessValidTill: { not: null, lt: new Date() } },
        { pucValidTill: { not: null, lt: new Date() } },
      ],
    });
  }
  if (filters.docs === "expiring") {
    const horizon = new Date(Date.now() + 30 * 86400000);
    and.push({
      OR: [
        { insuranceValidTill: { not: null, gte: new Date(), lte: horizon } },
        { fitnessValidTill: { not: null, gte: new Date(), lte: horizon } },
        { pucValidTill: { not: null, gte: new Date(), lte: horizon } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

/* ------------------------------------------------------------------ */
/* SELECTIONS                                                          */
/* ------------------------------------------------------------------ */

export const vehicleCardSelect = {
  id: true,
  stockId: true,
  make: true,
  model: true,
  variant: true,
  year: true,
  fuelType: true,
  transmission: true,
  bodyType: true,
  kmDriven: true,
  ownership: true,
  colour: true,
  sellingPrice: true,
  originalPrice: true,
  status: true,
  isFeatured: true,
  listedAt: true,
  createdAt: true,
  viewCount: true,
  enquiryCount: true,
  branch: { select: { id: true, name: true, city: true } },
  images: {
    select: { url: true, isCover: true, kind: true },
    where: { kind: "photo" },
    orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
    take: 1,
  },
  _count: { select: { images: true } },
} satisfies Prisma.VehicleSelect;

export type VehicleCard = Prisma.VehicleGetPayload<{ select: typeof vehicleCardSelect }>;

export function coverImage(v: { images: { url: string }[] }): string | null {
  return v.images[0]?.url ?? null;
}

/** Days in stock. Falls back to createdAt for vehicles never published. */
export function ageingDays(v: { listedAt: Date | null; createdAt: Date; soldAt?: Date | null }): number {
  const from = v.listedAt ?? v.createdAt;
  return daysBetween(from, v.soldAt ?? new Date());
}

/* ------------------------------------------------------------------ */
/* QUERIES                                                             */
/* ------------------------------------------------------------------ */

export const PAGE_SIZE = 12;

export async function listVehicles(
  filters: VehicleFilters,
  opts: Parameters<typeof buildVehicleWhere>[1] & { pageSize?: number },
) {
  const where = buildVehicleWhere(filters, opts);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = filters.page ?? 1;

  const [items, total] = await Promise.all([
    db.vehicle.findMany({
      where,
      select: vehicleCardSelect,
      orderBy: vehicleOrderBy(filters.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.vehicle.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Distinct values used to build filter dropdowns, computed from live stock. */
export async function vehicleFacets(opts: { dealerId: string; publicOnly?: boolean }) {
  const where = buildVehicleWhere({}, opts);
  const [makes, fuels, bodyTypes, transmissions, colours, agg] = await Promise.all([
    db.vehicle.groupBy({ by: ["make"], where, _count: { _all: true }, orderBy: { make: "asc" } }),
    db.vehicle.groupBy({ by: ["fuelType"], where, _count: { _all: true } }),
    db.vehicle.groupBy({ by: ["bodyType"], where, _count: { _all: true } }),
    db.vehicle.groupBy({ by: ["transmission"], where, _count: { _all: true } }),
    db.vehicle.groupBy({ by: ["colour"], where, _count: { _all: true } }),
    db.vehicle.aggregate({
      where,
      _min: { sellingPrice: true, year: true, kmDriven: true },
      _max: { sellingPrice: true, year: true, kmDriven: true },
    }),
  ]);

  return {
    makes: makes.map((m) => ({ value: m.make, count: m._count._all })),
    fuels: fuels.map((m) => ({ value: m.fuelType, count: m._count._all })),
    bodyTypes: bodyTypes
      .map((m) => ({ value: m.bodyType, count: m._count._all }))
      .sort((a, b) => b.count - a.count),
    transmissions: transmissions.map((m) => ({ value: m.transmission, count: m._count._all })),
    colours: colours
      .filter((c) => c.colour)
      .map((m) => ({ value: m.colour as string, count: m._count._all })),
    priceMin: agg._min.sellingPrice ?? 0,
    priceMax: agg._max.sellingPrice ?? 5000000,
    yearMin: agg._min.year ?? 2010,
    yearMax: agg._max.year ?? new Date().getFullYear(),
    kmMax: agg._max.kmDriven ?? 200000,
  };
}

export async function getVehicleDetail(dealerId: string, idOrStock: string) {
  return db.vehicle.findFirst({
    where: {
      dealerId,
      OR: [{ id: idOrStock }, { stockId: idOrStock }],
    },
    include: {
      images: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] },
      branch: true,
      createdBy: { select: { id: true, name: true } },
      sales: {
        include: { customer: true, salesExecutive: { select: { id: true, name: true } } },
      },
      bookings: {
        where: { status: { not: "cancelled" } },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { leads: true, testDrives: true } },
    },
  });
}

/**
 * Removes every private commercial field. Call this before sending a vehicle
 * to a client component or a public page unless the viewer holds the permission.
 */
export function sanitiseVehicle<
  T extends {
    purchasePrice?: number | null;
    minAcceptablePrice?: number | null;
    refurbishmentCost?: number | null;
    internalNotes?: string | null;
  },
>(vehicle: T, opts: { canSeeCost: boolean; canSeeMargin: boolean }): T {
  const clone = { ...vehicle };
  if (!opts.canSeeCost) {
    clone.purchasePrice = null;
    clone.minAcceptablePrice = null;
    clone.refurbishmentCost = null;
    clone.internalNotes = null;
  }
  return clone;
}

export function vehicleMargin(v: {
  sellingPrice: number;
  purchasePrice?: number | null;
  refurbishmentCost?: number | null;
}) {
  const cost = (v.purchasePrice ?? 0) + (v.refurbishmentCost ?? 0);
  if (!cost) return null;
  const profit = v.sellingPrice - cost;
  return { cost, profit, marginPct: Math.round((profit / cost) * 1000) / 10 };
}

export function vehicleFeatures(v: { features: string }): string[] {
  return safeJsonParse<string[]>(v.features, []);
}

/** Similar stock for the vehicle detail page: same body type, nearby price. */
export async function similarVehicles(vehicle: {
  id: string;
  dealerId: string;
  bodyType: string;
  sellingPrice: number;
  make: string;
}) {
  const span = Math.max(200000, vehicle.sellingPrice * 0.35);
  return db.vehicle.findMany({
    where: {
      dealerId: vehicle.dealerId,
      id: { not: vehicle.id },
      status: { in: [...PUBLIC_VEHICLE_STATUSES] },
      OR: [
        { bodyType: vehicle.bodyType },
        { make: vehicle.make },
        { sellingPrice: { gte: vehicle.sellingPrice - span, lte: vehicle.sellingPrice + span } },
      ],
    },
    select: vehicleCardSelect,
    take: 4,
    orderBy: { isFeatured: "desc" },
  });
}

/** Next stock number for a dealer, e.g. STK-0042. */
export async function nextStockId(dealerId: string) {
  const count = await db.vehicle.count({ where: { dealerId } });
  let n = count + 1;
  // Guard against gaps from deletions producing a collision.
  for (let i = 0; i < 50; i++) {
    const candidate = `STK-${String(n).padStart(4, "0")}`;
    const exists = await db.vehicle.findFirst({
      where: { dealerId, stockId: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    n++;
  }
  return `STK-${Date.now().toString().slice(-6)}`;
}

/** Ageing distribution for the dashboard and the ageing report. */
export async function ageingReport(dealerId: string, branchIds?: string[]) {
  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId,
      status: { in: ["available", "reserved", "booked"] },
      ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    },
    select: {
      id: true,
      stockId: true,
      make: true,
      model: true,
      variant: true,
      year: true,
      sellingPrice: true,
      status: true,
      listedAt: true,
      createdAt: true,
      enquiryCount: true,
      branch: { select: { id: true, name: true } },
      images: {
        select: { url: true },
        where: { kind: "photo" },
        orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
        take: 1,
      },
    },
  });

  const withAge = vehicles.map((v) => ({ ...v, days: ageingDays(v) }));
  const buckets = [
    { key: "0-15", label: "0-15 days", min: 0, max: 15 },
    { key: "16-30", label: "16-30 days", min: 16, max: 30 },
    { key: "31-60", label: "31-60 days", min: 31, max: 60 },
    { key: "61-90", label: "61-90 days", min: 61, max: 90 },
    { key: "90+", label: "90+ days", min: 91, max: Number.MAX_SAFE_INTEGER },
  ].map((b) => {
    const items = withAge.filter((v) => v.days >= b.min && v.days <= b.max);
    return {
      ...b,
      count: items.length,
      value: items.reduce((s, v) => s + v.sellingPrice, 0),
    };
  });

  return {
    buckets,
    total: withAge.length,
    stale: withAge.filter((v) => v.days > 60).sort((a, b) => b.days - a.days),
    all: withAge.sort((a, b) => b.days - a.days),
  };
}
