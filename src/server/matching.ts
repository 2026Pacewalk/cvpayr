import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

/**
 * Requirement ⇄ inventory matching.
 *
 * One scoring function drives both directions — "which cars suit this customer"
 * and "which customers want this car" — so the two can never disagree. Keeping
 * it in a single place also means the rules can be tuned once and improve
 * everywhere.
 */

export type RequirementLike = {
  id?: string;
  budgetMin: number | null;
  budgetMax: number | null;
  make: string | null;
  model: string | null;
  fuelTypes: string;
  transmissions: string;
  bodyTypes: string;
  yearMin: number | null;
  kmMax: number | null;
  ownershipMax: number | null;
  colour: string | null;
  city: string | null;
  branchId: string | null;
};

export type VehicleLike = {
  id: string;
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  bodyType: string;
  year: number;
  kmDriven: number;
  ownership: number;
  colour: string | null;
  sellingPrice: number;
  branchId: string;
  branch?: { city: string | null } | null;
};

export type MatchCriterion = {
  label: string;
  /** true = met, false = missed, null = the customer did not specify it. */
  met: boolean | null;
  detail?: string;
};

export type MatchResult = {
  /** 0–100. Only criteria the customer actually specified are counted. */
  score: number;
  /** A miss on budget or make is disqualifying; everything else is a soft miss. */
  isMatch: boolean;
  hardMiss: string | null;
  criteria: MatchCriterion[];
};

/** How much each criterion contributes when the customer specified it. */
const WEIGHTS = {
  budget: 30,
  make: 20,
  model: 15,
  fuel: 10,
  transmission: 10,
  bodyType: 5,
  year: 5,
  km: 3,
  ownership: 1,
  location: 1,
} as const;

const list = (json: string) => safeJsonParse<string[]>(json, []);
const eq = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/**
 * Scores one vehicle against one requirement.
 *
 * A budget or brand miss disqualifies outright — showing a dealer a ₹20 lakh SUV
 * for a ₹8 lakh brief destroys trust in the whole feature. Everything else only
 * reduces the score.
 */
export function scoreMatch(req: RequirementLike, vehicle: VehicleLike): MatchResult {
  const criteria: MatchCriterion[] = [];
  let earned = 0;
  let possible = 0;
  let hardMiss: string | null = null;

  const consider = (
    key: keyof typeof WEIGHTS,
    label: string,
    specified: boolean,
    met: boolean,
    detail?: string,
    hard = false,
  ) => {
    if (!specified) {
      criteria.push({ label, met: null });
      return;
    }
    possible += WEIGHTS[key];
    if (met) earned += WEIGHTS[key];
    else if (hard && !hardMiss) hardMiss = label;
    criteria.push({ label, met, detail });
  };

  // Budget — a ceiling is what customers actually hold to.
  const overBudget = req.budgetMax != null && vehicle.sellingPrice > req.budgetMax;
  const underBudget = req.budgetMin != null && vehicle.sellingPrice < req.budgetMin;
  consider(
    "budget",
    "Budget",
    req.budgetMin != null || req.budgetMax != null,
    !overBudget && !underBudget,
    overBudget ? "Above budget" : underBudget ? "Below the range" : undefined,
    true,
  );

  consider("make", "Brand", Boolean(req.make), eq(req.make, vehicle.make), undefined, true);

  consider(
    "model",
    "Model",
    Boolean(req.model),
    Boolean(req.model && vehicle.model.toLowerCase().includes(req.model.trim().toLowerCase())),
  );

  const fuels = list(req.fuelTypes);
  consider("fuel", "Fuel", fuels.length > 0, fuels.some((f) => eq(f, vehicle.fuelType)));

  const transmissions = list(req.transmissions);
  consider(
    "transmission",
    "Transmission",
    transmissions.length > 0,
    transmissions.some((t) => eq(t, vehicle.transmission)),
  );

  const bodies = list(req.bodyTypes);
  consider("bodyType", "Body type", bodies.length > 0, bodies.some((b) => eq(b, vehicle.bodyType)));

  consider(
    "year",
    "Year",
    req.yearMin != null,
    req.yearMin == null || vehicle.year >= req.yearMin,
    req.yearMin != null && vehicle.year < req.yearMin ? `${vehicle.year} is older` : undefined,
  );

  consider(
    "km",
    "Kilometres",
    req.kmMax != null,
    req.kmMax == null || vehicle.kmDriven <= req.kmMax,
  );

  consider(
    "ownership",
    "Ownership",
    req.ownershipMax != null,
    req.ownershipMax == null || vehicle.ownership <= req.ownershipMax,
  );

  const wantsBranch = Boolean(req.branchId || req.city);
  consider(
    "location",
    "Location",
    wantsBranch,
    (req.branchId ? req.branchId === vehicle.branchId : false) ||
      (req.city ? eq(req.city, vehicle.branch?.city ?? null) : false),
  );

  // Colour is a preference, never a filter — noted but never scored.
  if (req.colour) {
    criteria.push({
      label: "Colour",
      met: eq(req.colour, vehicle.colour),
      detail: "Preference only",
    });
  }

  const score = possible === 0 ? 60 : Math.round((earned / possible) * 100);

  return {
    score,
    isMatch: !hardMiss && score >= 55,
    hardMiss,
    criteria,
  };
}

/**
 * A coarse database filter so we never score the entire inventory in memory.
 * Deliberately generous — precision comes from `scoreMatch`.
 */
function candidateWhere(req: RequirementLike, dealerId: string): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {
    dealerId,
    status: { in: ["available", "reserved"] },
  };

  if (req.budgetMax != null) {
    // 10% headroom: a dealer will happily negotiate slightly over budget.
    where.sellingPrice = { lte: Math.round(req.budgetMax * 1.1) };
  }
  if (req.make) where.make = req.make;
  if (req.yearMin != null) where.year = { gte: req.yearMin - 1 };

  return where;
}

export type VehicleMatch = MatchResult & {
  vehicle: VehicleLike & {
    stockId: string;
    variant: string | null;
    status: string;
    images: { url: string }[];
    branch: { id: string; name: string; city: string };
  };
};

/** Cars currently in stock that suit a requirement, best first. */
export async function matchVehiclesForRequirement(
  req: RequirementLike,
  dealerId: string,
  opts?: { limit?: number },
): Promise<VehicleMatch[]> {
  const candidates = await db.vehicle.findMany({
    where: candidateWhere(req, dealerId),
    select: {
      id: true, stockId: true, make: true, model: true, variant: true, year: true,
      fuelType: true, transmission: true, bodyType: true, colour: true,
      kmDriven: true, ownership: true, sellingPrice: true, status: true, branchId: true,
      branch: { select: { id: true, name: true, city: true } },
      images: {
        select: { url: true },
        where: { kind: "photo" },
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
    take: 300,
  });

  return candidates
    .map((vehicle) => ({ ...scoreMatch(req, vehicle), vehicle }))
    .filter((m) => m.isMatch)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts?.limit ?? 20);
}

export type RequirementMatch = MatchResult & {
  requirement: {
    id: string;
    priority: string;
    status: string;
    budgetMin: number | null;
    budgetMax: number | null;
    createdAt: Date;
    branchId: string | null;
    createdById: string | null;
    customer: { id: string; name: string; phone: string };
    createdBy: { name: string } | null;
  };
};

/**
 * Customers whose open brief this vehicle satisfies.
 * Runs whenever a car is added or re-priced.
 */
export async function matchRequirementsForVehicle(
  vehicle: VehicleLike,
  dealerId: string,
  opts?: { limit?: number; branchIds?: string[] },
): Promise<RequirementMatch[]> {
  // Branch scoping is applied in the query, not in the caller, so a restricted
  // user can never see another branch's briefs.
  const branchScope = opts?.branchIds?.length
    ? { OR: [{ branchId: { in: opts.branchIds } }, { branchId: null }] }
    : {};

  const requirements = await db.customerRequirement.findMany({
    where: {
      dealerId,
      status: { in: ["open", "matched"] },
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }],
      ...branchScope,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
    },
    take: 500,
  });

  return requirements
    .map((requirement) => ({ ...scoreMatch(requirement, vehicle), requirement }))
    .filter((m) => m.isMatch)
    .sort((a, b) => {
      // High-priority customers first, then by how well the car fits.
      const rank = (p: string) => (p === "high" ? 0 : p === "medium" ? 1 : 2);
      const byPriority = rank(a.requirement.priority) - rank(b.requirement.priority);
      return byPriority !== 0 ? byPriority : b.score - a.score;
    })
    .slice(0, opts?.limit ?? 20);
}

/** Cheap count for badges, without building the full match payload. */
export async function countRequirementMatches(vehicle: VehicleLike, dealerId: string) {
  const matches = await matchRequirementsForVehicle(vehicle, dealerId, { limit: 999 });
  return matches.length;
}
