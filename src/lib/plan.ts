import "server-only";
import { db } from "./db";
import { safeJsonParse } from "./utils";

/**
 * Every plan limit and feature flag is resolved through this module.
 * Feature code asks `checkLimit(dealerId, "vehicles")` rather than hardcoding numbers,
 * so changing a plan is a data change, not a code change.
 */

export type PlanFeatureKey =
  | "customDomain"
  | "advancedReports"
  | "crm"
  | "customBranding"
  | "apiAccess"
  | "prioritySupport"
  | "bulkImport";

export type ResolvedPlan = {
  planCode: string;
  planName: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  limits: {
    maxBranches: number;
    maxUsers: number;
    maxVehicles: number;
    maxImagesPerVehicle: number;
    storageMb: number;
  };
  features: Record<PlanFeatureKey, boolean>;
};

const FALLBACK: ResolvedPlan = {
  planCode: "starter",
  planName: "Starter",
  status: "trial",
  trialEndsAt: null,
  currentPeriodEnd: null,
  limits: { maxBranches: 1, maxUsers: 3, maxVehicles: 50, maxImagesPerVehicle: 15, storageMb: 1024 },
  features: {
    customDomain: false, advancedReports: false, crm: true, customBranding: false,
    apiAccess: false, prioritySupport: false, bulkImport: false,
  },
};

export async function resolvePlan(dealerId: string): Promise<ResolvedPlan> {
  const sub = await db.subscription.findUnique({
    where: { dealerId },
    include: { plan: true },
  });
  if (!sub) return FALLBACK;

  return {
    planCode: sub.plan.code,
    planName: sub.plan.name,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    limits: {
      maxBranches: sub.plan.maxBranches,
      maxUsers: sub.plan.maxUsers,
      maxVehicles: sub.plan.maxVehicles,
      maxImagesPerVehicle: sub.plan.maxImagesPerVehicle,
      storageMb: sub.plan.storageMb,
    },
    features: { ...FALLBACK.features, ...safeJsonParse<Record<string, boolean>>(sub.plan.features, {}) },
  };
}

export async function hasFeature(dealerId: string, feature: PlanFeatureKey): Promise<boolean> {
  const plan = await resolvePlan(dealerId);
  return Boolean(plan.features[feature]);
}

export type UsageKind = "branches" | "users" | "vehicles";

export type LimitCheck = {
  kind: UsageKind;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  /** -1 limit means unlimited. */
  unlimited: boolean;
  message?: string;
};

const LIMIT_FIELD: Record<UsageKind, keyof ResolvedPlan["limits"]> = {
  branches: "maxBranches",
  users: "maxUsers",
  vehicles: "maxVehicles",
};

const LABEL: Record<UsageKind, string> = {
  branches: "branches",
  users: "staff accounts",
  vehicles: "vehicles",
};

export async function getUsage(dealerId: string) {
  const [branches, users, vehicles] = await Promise.all([
    db.branch.count({ where: { dealerId } }),
    db.user.count({ where: { dealerId } }),
    db.vehicle.count({ where: { dealerId, status: { not: "sold" } } }),
  ]);
  return { branches, users, vehicles };
}

/** Ask before creating a branch / user / vehicle. */
export async function checkLimit(dealerId: string, kind: UsageKind): Promise<LimitCheck> {
  const [plan, usage] = await Promise.all([resolvePlan(dealerId), getUsage(dealerId)]);
  const limit = plan.limits[LIMIT_FIELD[kind]];
  const used = usage[kind];
  const unlimited = limit < 0;
  const allowed = unlimited || used < limit;
  return {
    kind,
    used,
    limit,
    unlimited,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    allowed,
    message: allowed
      ? undefined
      : `Your ${plan.planName} plan allows ${limit} ${LABEL[kind]}. Upgrade to add more.`,
  };
}

export class PlanLimitError extends Error {
  constructor(public check: LimitCheck) {
    super(check.message ?? "Plan limit reached");
    this.name = "PlanLimitError";
  }
}

export async function assertWithinLimit(dealerId: string, kind: UsageKind) {
  const check = await checkLimit(dealerId, kind);
  if (!check.allowed) throw new PlanLimitError(check);
  return check;
}
