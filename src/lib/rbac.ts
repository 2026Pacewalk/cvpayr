import type { SessionUser } from "./auth";
import { PERMISSIONS, type PermissionKey } from "./permissions";

/** Does this principal hold the permission? Super admins hold everything. */
export function can(user: Pick<SessionUser, "permissions" | "isSuperAdmin">, permission: PermissionKey): boolean {
  if (user.isSuperAdmin) return true;
  return user.permissions.includes(permission);
}

export function canAny(user: SessionUser, ...permissions: PermissionKey[]): boolean {
  return permissions.some((p) => can(user, p));
}

export function canAll(user: SessionUser, ...permissions: PermissionKey[]): boolean {
  return permissions.every((p) => can(user, p));
}

export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Throws if the permission is absent. Use at the top of every mutating server action. */
export function assertCan(user: SessionUser, permission: PermissionKey): void {
  if (!can(user, permission)) throw new ForbiddenError(permission);
}

/**
 * Branch scoping. A user with no UserBranch rows sees every branch of their dealer;
 * otherwise queries are narrowed to their assigned branches.
 * Returns `undefined` when no narrowing is needed so it can be spread into a Prisma where clause.
 */
export function branchScope(user: SessionUser): { in: string[] } | undefined {
  if (user.isSuperAdmin) return undefined;
  if (!user.branchIds.length) return undefined;
  return { in: user.branchIds };
}

export function isBranchAllowed(user: SessionUser, branchId: string | null | undefined): boolean {
  if (!branchId) return true;
  if (user.isSuperAdmin || !user.branchIds.length) return true;
  return user.branchIds.includes(branchId);
}

/** True when the user may see acquisition cost / minimum price fields. */
export function canSeeCost(user: SessionUser): boolean {
  return can(user, PERMISSIONS.INVENTORY_VIEW_COST);
}

/** True when the user may see profit and margin figures. */
export function canSeeMargin(user: SessionUser): boolean {
  return can(user, PERMISSIONS.INVENTORY_VIEW_MARGIN);
}

/**
 * Leads visibility: without `leads.view_all` a user only ever sees leads they own.
 * Returns a partial Prisma where clause.
 */
export function leadOwnershipScope(user: SessionUser): { ownerId?: string } {
  if (can(user, PERMISSIONS.LEADS_VIEW_ALL)) return {};
  return { ownerId: user.id };
}

/** Navigation gating — one entry per CRM section. */
export const NAV_PERMISSIONS = {
  dashboard: null,
  inventory: PERMISSIONS.INVENTORY_VIEW,
  quickSearch: PERMISSIONS.INVENTORY_VIEW,
  branches: PERMISSIONS.BRANCHES_VIEW,
  leads: PERMISSIONS.LEADS_VIEW,
  customers: PERMISSIONS.CUSTOMERS_VIEW,
  followUps: PERMISSIONS.LEADS_VIEW,
  testDrives: PERMISSIONS.LEADS_VIEW,
  sales: PERMISSIONS.SALES_VIEW,
  staff: PERMISSIONS.STAFF_VIEW,
  roles: PERMISSIONS.ROLES_MANAGE,
  reports: PERMISSIONS.REPORTS_VIEW,
  settings: PERMISSIONS.SETTINGS_VIEW,
  website: PERMISSIONS.WEBSITE_MANAGE,
  audit: PERMISSIONS.AUDIT_VIEW,
} as const;
