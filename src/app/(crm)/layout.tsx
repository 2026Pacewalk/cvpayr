import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { resolvePlan } from "@/lib/plan";
import { db } from "@/lib/db";
import { AppShell, type NavItem } from "@/components/crm/AppShell";
import { unreadCount, inboxWhere } from "@/server/notifications";
import { getAttention, attentionScope } from "@/server/attention";
import { safeJsonParse } from "@/lib/utils";
import { startOfDay } from "@/lib/utils";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDealerUser();
  const plan = await resolvePlan(user.dealerId);

  // Counts that drive the sidebar badges. Scoped exactly like the pages they link to.
  const branchFilter = user.branchIds.length ? { branchId: { in: user.branchIds } } : {};
  const ownerFilter = can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id };

  const [newLeads, dueFollowUps, openRequirements, unread] = await Promise.all([
    can(user, PERMISSIONS.LEADS_VIEW)
      ? db.lead.count({
          where: { dealerId: user.dealerId, stage: "new", ...branchFilter, ...ownerFilter },
        })
      : 0,
    can(user, PERMISSIONS.LEADS_VIEW)
      ? db.followUp.count({
          where: {
            dealerId: user.dealerId,
            status: "pending",
            dueAt: { lt: new Date(startOfDay().getTime() + 86400000) },
            ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { assignedToId: user.id }),
          },
        })
      : 0,
    can(user, PERMISSIONS.LEADS_VIEW)
      ? db.customerRequirement.count({
          where: {
            dealerId: user.dealerId,
            status: { in: ["open", "matched"] },
            ...(user.branchIds.length
              ? { OR: [{ branchId: { in: user.branchIds } }, { branchId: null }] }
              : {}),
          },
        })
      : 0,
    unreadCount({ dealerId: user.dealerId, userId: user.id, branchIds: user.branchIds }),
  ]);

  // Unresolved work, for the sidebar badge. Same engine the action centre uses,
  // so the number in the nav can never disagree with the page it links to.
  const attention = await getAttention(attentionScope(user));

  // Seeds the bell so the first paint is correct; it polls for updates after.
  const recent = await db.notification.findMany({
    where: {
      ...inboxWhere({ dealerId: user.dealerId, userId: user.id, branchIds: user.branchIds }),
      isRead: false,
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  // Every entry is permission-gated: a user never sees a link they cannot open.
  const nav: NavItem[] = [
    { key: "dashboard", href: "/dashboard", label: "Dashboard", group: "main" },
    {
      key: "attention",
      href: "/attention",
      label: "Needs attention",
      badge: attention.counts.critical + attention.counts.high,
      group: "main",
    },
    ...(can(user, PERMISSIONS.INVENTORY_VIEW)
      ? ([
          { key: "inventory", href: "/inventory", label: "Inventory", group: "main" },
          { key: "quickSearch", href: "/quick-search", label: "Quick Match", group: "main" },
        ] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.BRANCHES_VIEW)
      ? ([{ key: "branches", href: "/branches", label: "Branches", group: "main" }] as NavItem[])
      : []),

    ...(can(user, PERMISSIONS.LEADS_VIEW)
      ? ([
          { key: "leads", href: "/leads", label: "Leads", badge: newLeads, group: "sales" },
          { key: "followUps", href: "/followups", label: "Follow-ups", badge: dueFollowUps, group: "sales" },
          { key: "testDrives", href: "/test-drives", label: "Test Drives", group: "sales" },
          { key: "requirements", href: "/requirements", label: "Requirements", badge: openRequirements, group: "sales" },
        ] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.CUSTOMERS_VIEW)
      ? ([{ key: "customers", href: "/customers", label: "Customers", group: "sales" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.SALES_VIEW)
      ? ([{ key: "sales", href: "/sales", label: "Bookings & Sales", group: "sales" }] as NavItem[])
      : []),

    ...(can(user, PERMISSIONS.REPORTS_VIEW)
      ? ([{ key: "reports", href: "/reports", label: "Reports", group: "org" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.STAFF_VIEW)
      ? ([{ key: "staff", href: "/staff", label: "Staff", group: "org" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.ROLES_MANAGE)
      ? ([{ key: "roles", href: "/roles", label: "Roles & Access", group: "org" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.WEBSITE_MANAGE)
      ? ([{ key: "website", href: "/website", label: "Website", group: "org" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.SETTINGS_VIEW)
      ? ([{ key: "settings", href: "/settings", label: "Settings", group: "org" }] as NavItem[])
      : []),
    ...(can(user, PERMISSIONS.AUDIT_VIEW)
      ? ([{ key: "audit", href: "/audit", label: "Activity Log", group: "org" }] as NavItem[])
      : []),
  ];

  return (
    <AppShell
      nav={nav}
      unreadCount={unread}
      recentNotifications={recent.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        priority: n.priority,
        category: n.category,
        createdAt: n.createdAt.toISOString(),
        meta: safeJsonParse<Record<string, unknown>>(n.meta, {}),
      }))}
      canAddVehicle={can(user, PERMISSIONS.INVENTORY_CREATE)}
      user={{
        name: user.name,
        email: user.email,
        roleName: user.roleName,
        avatarUrl: user.avatarUrl,
        dealerName: user.dealerName,
        dealerSlug: user.dealerSlug,
        planName: plan.planName,
        planStatus: plan.status,
      }}
    >
      {children}
    </AppShell>
  );
}
