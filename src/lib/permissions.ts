/**
 * RBAC catalogue.
 *
 * Every guarded capability in the product has exactly one permission key here.
 * Roles are stored per-dealer with a JSON array of these keys, so a Dealer Owner
 * can clone a template role and tick/untick individual capabilities.
 */

export const PERMISSIONS = {
  // Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_EDIT: "inventory.edit",
  INVENTORY_DELETE: "inventory.delete",
  INVENTORY_TRANSFER: "inventory.transfer",
  INVENTORY_VIEW_COST: "inventory.view_cost",
  INVENTORY_VIEW_MARGIN: "inventory.view_margin",

  // Leads
  LEADS_VIEW: "leads.view",
  LEADS_VIEW_ALL: "leads.view_all", // otherwise only leads assigned to me
  LEADS_MANAGE: "leads.manage",
  LEADS_ASSIGN: "leads.assign",
  LEADS_DELETE: "leads.delete",

  // Customers
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",

  // Sales
  SALES_VIEW: "sales.view",
  SALES_MANAGE: "sales.manage",

  // Org
  BRANCHES_VIEW: "branches.view",
  BRANCHES_MANAGE: "branches.manage",
  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",
  ROLES_MANAGE: "roles.manage",

  // Insight
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  AUDIT_VIEW: "audit.view",

  // Settings
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  WEBSITE_MANAGE: "website.manage",
  CATALOG_SHARE: "catalog.share",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Grouped for the Roles & Permissions settings screen. */
export const PERMISSION_GROUPS: {
  group: string;
  description: string;
  items: { key: PermissionKey; label: string; hint?: string; sensitive?: boolean }[];
}[] = [
  {
    group: "Inventory",
    description: "Vehicle stock, pricing and branch transfers",
    items: [
      { key: PERMISSIONS.INVENTORY_VIEW, label: "View inventory" },
      { key: PERMISSIONS.INVENTORY_CREATE, label: "Add vehicles" },
      { key: PERMISSIONS.INVENTORY_EDIT, label: "Edit vehicles" },
      { key: PERMISSIONS.INVENTORY_DELETE, label: "Deactivate / delete vehicles" },
      { key: PERMISSIONS.INVENTORY_TRANSFER, label: "Transfer between branches" },
      {
        key: PERMISSIONS.INVENTORY_VIEW_COST,
        label: "View purchase cost",
        hint: "Acquisition cost, refurbishment spend and minimum acceptable price",
        sensitive: true,
      },
      {
        key: PERMISSIONS.INVENTORY_VIEW_MARGIN,
        label: "View profit margin",
        hint: "Per-vehicle and aggregate profitability",
        sensitive: true,
      },
    ],
  },
  {
    group: "Leads & CRM",
    description: "Enquiries, pipeline and follow-ups",
    items: [
      { key: PERMISSIONS.LEADS_VIEW, label: "View leads" },
      { key: PERMISSIONS.LEADS_VIEW_ALL, label: "View all leads", hint: "Without this, staff only see leads assigned to them" },
      { key: PERMISSIONS.LEADS_MANAGE, label: "Update leads, notes and follow-ups" },
      { key: PERMISSIONS.LEADS_ASSIGN, label: "Assign leads to staff" },
      { key: PERMISSIONS.LEADS_DELETE, label: "Delete leads" },
      { key: PERMISSIONS.CUSTOMERS_VIEW, label: "View customer database" },
      { key: PERMISSIONS.CUSTOMERS_MANAGE, label: "Edit customer records" },
      { key: PERMISSIONS.CATALOG_SHARE, label: "Create shareable catalogs" },
    ],
  },
  {
    group: "Sales",
    description: "Test drives, bookings and completed sales",
    items: [
      { key: PERMISSIONS.SALES_VIEW, label: "View bookings & sales" },
      { key: PERMISSIONS.SALES_MANAGE, label: "Record bookings & close sales" },
    ],
  },
  {
    group: "Organisation",
    description: "Branches, staff and access control",
    items: [
      { key: PERMISSIONS.BRANCHES_VIEW, label: "View branches" },
      { key: PERMISSIONS.BRANCHES_MANAGE, label: "Manage branches" },
      { key: PERMISSIONS.STAFF_VIEW, label: "View staff" },
      { key: PERMISSIONS.STAFF_MANAGE, label: "Add & manage staff", sensitive: true },
      { key: PERMISSIONS.ROLES_MANAGE, label: "Manage roles & permissions", sensitive: true },
    ],
  },
  {
    group: "Reports & Settings",
    description: "Business insight and dealership configuration",
    items: [
      { key: PERMISSIONS.REPORTS_VIEW, label: "View reports" },
      { key: PERMISSIONS.REPORTS_EXPORT, label: "Export data" },
      { key: PERMISSIONS.AUDIT_VIEW, label: "View audit log" },
      { key: PERMISSIONS.SETTINGS_VIEW, label: "View dealership settings" },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: "Edit dealership settings", sensitive: true },
      { key: PERMISSIONS.WEBSITE_MANAGE, label: "Manage public website" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);

const P = PERMISSIONS;

/** Seeded role templates. A dealer can edit these or create their own. */
export const ROLE_TEMPLATES: {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}[] = [
  {
    key: "dealer_owner",
    name: "Dealer Owner",
    description: "Full access to the entire dealership account including costs and margins.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "branch_manager",
    name: "Branch Manager",
    description: "Runs one or more branches. Sees costs but cannot change account settings.",
    permissions: [
      P.INVENTORY_VIEW, P.INVENTORY_CREATE, P.INVENTORY_EDIT, P.INVENTORY_TRANSFER,
      P.INVENTORY_VIEW_COST, P.INVENTORY_VIEW_MARGIN,
      P.LEADS_VIEW, P.LEADS_VIEW_ALL, P.LEADS_MANAGE, P.LEADS_ASSIGN,
      P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE, P.CATALOG_SHARE,
      P.SALES_VIEW, P.SALES_MANAGE,
      P.BRANCHES_VIEW, P.STAFF_VIEW,
      P.REPORTS_VIEW, P.REPORTS_EXPORT, P.SETTINGS_VIEW,
    ],
  },
  {
    key: "inventory_manager",
    name: "Inventory Manager",
    description: "Owns vehicle stock: listings, photos, pricing and transfers.",
    permissions: [
      P.INVENTORY_VIEW, P.INVENTORY_CREATE, P.INVENTORY_EDIT, P.INVENTORY_DELETE,
      P.INVENTORY_TRANSFER, P.INVENTORY_VIEW_COST,
      P.BRANCHES_VIEW, P.REPORTS_VIEW, P.CATALOG_SHARE,
    ],
  },
  {
    key: "sales_executive",
    name: "Sales Executive",
    description: "Works assigned leads, books test drives and closes deals.",
    permissions: [
      P.INVENTORY_VIEW,
      P.LEADS_VIEW, P.LEADS_MANAGE,
      P.CUSTOMERS_VIEW, P.CATALOG_SHARE,
      P.SALES_VIEW, P.SALES_MANAGE,
      P.BRANCHES_VIEW,
    ],
  },
  {
    key: "lead_manager",
    name: "Lead Manager",
    description: "Triages the full lead pipeline and distributes work to the sales team.",
    permissions: [
      P.INVENTORY_VIEW,
      P.LEADS_VIEW, P.LEADS_VIEW_ALL, P.LEADS_MANAGE, P.LEADS_ASSIGN, P.LEADS_DELETE,
      P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE, P.CATALOG_SHARE,
      P.SALES_VIEW, P.BRANCHES_VIEW, P.STAFF_VIEW, P.REPORTS_VIEW,
    ],
  },
  {
    key: "viewer",
    name: "View Only",
    description: "Read-only access to inventory and reports. Cannot see cost or margin.",
    permissions: [P.INVENTORY_VIEW, P.LEADS_VIEW, P.LEADS_VIEW_ALL, P.BRANCHES_VIEW, P.REPORTS_VIEW],
  },
];
