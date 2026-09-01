import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { startOfDay, endOfDay, addDays, formatPrice, formatTime, vehicleTitle } from "@/lib/utils";
import { LEAD_STAGE_META, type LeadStage } from "@/lib/constants";
import {
  ACTION_META,
  actionScore,
  escalate,
  slaBand,
  waitLabel,
  plural,
  DEFAULT_ATTENTION_SETTINGS,
  type ActionItem,
  type ActionKey,
  type ActionPriority,
  type AttentionResult,
  type AttentionSettings,
} from "@/lib/attention";

/**
 * The "Needs your attention" engine.
 *
 * Computes unresolved business work from live state on every call. Nothing is
 * stored, which is the point: the instant a lead is contacted, a follow-up is
 * completed or a car is sold, the corresponding action stops existing. There is
 * no queue to drain and no stale row to clean up.
 *
 * Scope is derived from the session on the server. A sales executive without
 * `leads.view_all` only ever sees their own work; a branch manager only their
 * branches. Deep links carry no ids that widen that.
 *
 * Performance: one `Promise.all` of indexed aggregate queries, gated by
 * permission so a role that cannot see a section never pays for it. Detail rows
 * are fetched with `take: 1` (the oldest or the next), never by loading a list
 * and sorting in memory.
 */

/* ---------------------------- CONFIGURATION --------------------------- */

/** Thresholds for a dealership, falling back to sensible defaults. */
export async function getAttentionSettings(dealerId: string): Promise<AttentionSettings> {
  const row = await db.crmSettings.findUnique({ where: { dealerId } });
  if (!row) return DEFAULT_ATTENTION_SETTINGS;
  return {
    attention: row.slaAttentionMinutes,
    high: row.slaHighMinutes,
    critical: row.slaCriticalMinutes,
    escalation: row.slaEscalationMinutes,
    ageingWarnDays: row.ageingWarnDays,
    ageingCriticalDays: row.ageingCriticalDays,
    zeroEnquiryDays: row.zeroEnquiryDays,
    leadWarmDays: row.leadWarmDays,
    leadColdDays: row.leadColdDays,
    bookingExpiryDays: row.bookingExpiryDays,
    testDriveSoonMinutes: row.testDriveSoonMinutes,
    stageStallDays: row.stageStallDays,
  };
}

/* ------------------------------- SCOPING ------------------------------ */

export type AttentionScope = {
  dealerId: string;
  /** Empty means every branch of the dealer. */
  branchIds: string[];
  /** Set when the user may only see leads they own. */
  ownerId?: string;
  userId: string;
  /** Restricts the whole centre to one branch, chosen in the UI. */
  focusBranchId?: string | null;
  can: {
    leads: boolean;
    leadsAll: boolean;
    leadsAssign: boolean;
    inventory: boolean;
    inventoryEdit: boolean;
    sales: boolean;
    salesManage: boolean;
    staff: boolean;
  };
};

/**
 * Derives the scope from the session. The only place permissions are read, so
 * a new action group cannot accidentally skip the check.
 */
export function attentionScope(
  user: SessionUser & { dealerId: string },
  focusBranchId?: string | null,
): AttentionScope {
  const leadsAll = can(user, PERMISSIONS.LEADS_VIEW_ALL);
  return {
    dealerId: user.dealerId,
    branchIds: user.branchIds,
    ownerId: leadsAll ? undefined : user.id,
    userId: user.id,
    focusBranchId: focusBranchId ?? null,
    can: {
      leads: can(user, PERMISSIONS.LEADS_VIEW),
      leadsAll,
      leadsAssign: can(user, PERMISSIONS.LEADS_ASSIGN),
      inventory: can(user, PERMISSIONS.INVENTORY_VIEW),
      inventoryEdit: can(user, PERMISSIONS.INVENTORY_EDIT),
      sales: can(user, PERMISSIONS.SALES_VIEW),
      salesManage: can(user, PERMISSIONS.SALES_MANAGE),
      staff: can(user, PERMISSIONS.STAFF_VIEW),
    },
  };
}

/**
 * Resolves the requested branch focus to one this user may actually use.
 *
 * Two checks, both needed. The branch must belong to *this dealership* — an
 * id from another tenant is silently dropped rather than narrowing to nothing
 * or, worse, being treated as valid. And a branch-restricted user may only
 * focus a branch they already hold.
 */
async function resolveFocusBranch(scope: AttentionScope): Promise<string | null> {
  if (!scope.focusBranchId) return null;

  if (scope.branchIds.length) {
    return scope.branchIds.includes(scope.focusBranchId) ? scope.focusBranchId : null;
  }

  const owned = await db.branch.findFirst({
    where: { id: scope.focusBranchId, dealerId: scope.dealerId },
    select: { id: true },
  });
  return owned?.id ?? null;
}

/**
 * Branch narrowing. A chosen branch must be one the user already has, so a
 * crafted `?branch=` cannot widen access.
 */
function branchFilter(scope: AttentionScope) {
  const allowed = scope.branchIds;
  if (scope.focusBranchId) {
    const permitted = !allowed.length || allowed.includes(scope.focusBranchId);
    if (permitted) return { branchId: scope.focusBranchId };
  }
  return allowed.length ? { branchId: { in: allowed } } : {};
}

/** Branch narrowing for records whose branch may legitimately be null. */
function branchFilterNullable(scope: AttentionScope) {
  const allowed = scope.branchIds;
  if (scope.focusBranchId && (!allowed.length || allowed.includes(scope.focusBranchId))) {
    return { OR: [{ branchId: scope.focusBranchId }, { branchId: null }] };
  }
  return allowed.length ? { OR: [{ branchId: { in: allowed } }, { branchId: null }] } : {};
}

const OPEN_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "follow_up",
  "test_drive_scheduled",
  "test_drive_completed",
  "negotiation",
  "booking_pending",
  "booked",
];

const CLOSED_STAGES = ["won", "lost", "not_interested"];

/* -------------------------------- BUILD ------------------------------- */

function build(
  key: ActionKey,
  input: {
    count: number;
    title: string;
    detail?: string | null;
    href: string;
    priority?: ActionPriority;
    overdueMinutes?: number;
    value?: number;
    lines?: string[];
    idSuffix?: string;
    cta?: string;
  },
): ActionItem {
  const meta = ACTION_META[key];
  const priority = input.priority ?? meta.priority;
  return {
    key,
    id: input.idSuffix ? `${key}:${input.idSuffix}` : key,
    priority,
    score: actionScore({
      priority,
      weight: meta.weight,
      count: input.count,
      overdueMinutes: input.overdueMinutes,
      value: input.value,
    }),
    count: input.count,
    title: input.title,
    detail: input.detail ?? null,
    href: input.href,
    cta: input.cta ?? meta.cta,
    lines: input.lines,
    // Rounded so a minute passing does not un-snooze; a real change does.
    stateHash: `${priority}:${input.count}`,
    dismissible: !meta.neverDismiss,
  };
}

/* ------------------------------- ENGINE ------------------------------- */

export async function getAttention(rawScope: AttentionScope): Promise<AttentionResult> {
  // Anything that failed validation is dropped before a single query runs.
  const scope: AttentionScope = {
    ...rawScope,
    focusBranchId: await resolveFocusBranch(rawScope),
  };

  const settings = await getAttentionSettings(scope.dealerId);
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const bLead = branchFilterNullable(scope);
  const bVehicle = branchFilter(scope);
  const owner = scope.ownerId ? { ownerId: scope.ownerId } : {};
  const leadBase = { dealerId: scope.dealerId, ...bLead, ...owner };

  const [
    leadGroups,
    followUpGroups,
    testDriveGroups,
    bookingGroups,
    requirementGroup,
    inventoryGroups,
    teamGroup,
  ] = await Promise.all([
    scope.can.leads ? leadActions(scope, settings, now, leadBase) : noItems(),
    scope.can.leads ? followUpActions(scope, now, dayStart, dayEnd) : noItems(),
    scope.can.leads ? testDriveActions(scope, settings, now, dayStart, dayEnd) : noItems(),
    scope.can.sales ? bookingActions(scope, settings, now) : noItems(),
    scope.can.leads ? requirementActions(scope) : noItems(),
    scope.can.inventory ? inventoryActions(scope, settings, now, bVehicle) : noItems(),
    scope.can.staff && scope.can.leadsAll ? teamActions(scope, now) : noItems(),
  ]);

  const all = [
    ...leadGroups,
    ...followUpGroups,
    ...testDriveGroups,
    ...bookingGroups,
    ...requirementGroup,
    ...inventoryGroups,
    ...teamGroup,
  ].filter((item) => item.count > 0);

  const visible = await applyDismissals(scope, all, now);
  visible.sort((a, b) => b.score - a.score);

  const counts = {
    total: visible.length,
    critical: visible.filter((i) => i.priority === "critical").length,
    high: visible.filter((i) => i.priority === "high").length,
    medium: visible.filter((i) => i.priority === "medium").length,
    low: visible.filter((i) => i.priority === "low").length,
  };

  return {
    items: visible,
    counts,
    workCount: visible.reduce((sum, i) => sum + i.count, 0),
    generatedAt: now.toISOString(),
  };
}

async function noItems(): Promise<ActionItem[]> {
  return [];
}

/* -------------------------------- LEADS ------------------------------- */

async function leadActions(
  scope: AttentionScope,
  settings: AttentionSettings,
  now: Date,
  leadBase: Record<string, unknown>,
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  const attentionCutoff = new Date(now.getTime() - settings.attention * 60_000);
  const coldCutoff = addDays(now, -settings.leadColdDays);
  const stallCutoff = addDays(now, -settings.stageStallDays);

  const uncontactedWhere = {
    ...leadBase,
    firstResponseAt: null,
    stage: { notIn: CLOSED_STAGES },
    createdAt: { lte: attentionCutoff },
  };

  const [
    uncontactedCount,
    oldestUncontacted,
    unassignedCount,
    oldestUnassigned,
    noNextStep,
    oldestNoNextStep,
    stalled,
    cold,
  ] = await Promise.all([
    db.lead.count({ where: uncontactedWhere }),
    db.lead.findFirst({
      where: uncontactedWhere,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, branch: { select: { name: true } } },
    }),

    // Only somebody who can assign is shown the unowned queue.
    scope.can.leadsAssign
      ? db.lead.count({
          where: { ...leadBase, ownerId: null, stage: { notIn: CLOSED_STAGES } },
        })
      : 0,
    scope.can.leadsAssign
      ? db.lead.findFirst({
          where: { ...leadBase, ownerId: null, stage: { notIn: CLOSED_STAGES } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : null,

    // An active opportunity with nothing scheduled next is the quietest way to
    // lose a deal, which is why it gets its own action.
    db.lead.count({
      where: {
        ...leadBase,
        stage: { in: ["interested", "follow_up", "test_drive_completed", "negotiation"] },
        OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lt: now } }],
      },
    }),
    db.lead.findFirst({
      where: {
        ...leadBase,
        stage: { in: ["interested", "follow_up", "test_drive_completed", "negotiation"] },
        OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lt: now } }],
      },
      orderBy: { lastActivityAt: "asc" },
      select: { lastActivityAt: true },
    }),

    db.lead.groupBy({
      by: ["stage"],
      where: {
        ...leadBase,
        stage: { in: ["interested", "negotiation", "test_drive_completed", "booking_pending"] },
        lastActivityAt: { lte: stallCutoff },
      },
      _count: { _all: true },
    }),

    db.lead.count({
      where: {
        ...leadBase,
        stage: { notIn: CLOSED_STAGES },
        lastActivityAt: { lte: coldCutoff },
      },
    }),
  ]);

  if (uncontactedCount > 0 && oldestUncontacted) {
    const waited = Math.floor((now.getTime() - oldestUncontacted.createdAt.getTime()) / 60_000);
    const { priority } = slaBand(waited, settings);
    items.push(
      build("leads.uncontacted", {
        count: uncontactedCount,
        // Escalated past the dealership's own promise, so it reads as critical.
        priority:
          waited >= settings.escalation
            ? "critical"
            : priority === "low"
              ? "medium"
              : priority,
        title: `${plural(uncontactedCount, "lead")} nobody has answered`,
        detail: `Oldest waiting ${waitLabel(waited)}`,
        overdueMinutes: waited - settings.attention,
        href: "/leads?bucket=uncontacted",
        lines: [
          `Your dealership answers within ${settings.attention} minutes.`,
          waited >= settings.critical
            ? "This one is past the point where most buyers have already called someone else."
            : "Reply now while they are still shopping.",
        ],
      }),
    );
  }

  if (unassignedCount > 0 && oldestUnassigned) {
    const waited = Math.floor((now.getTime() - oldestUnassigned.createdAt.getTime()) / 60_000);
    items.push(
      build("leads.unassigned", {
        count: unassignedCount,
        priority: waited >= settings.critical ? "critical" : "high",
        title: `${plural(unassignedCount, "lead")} with nobody accountable`,
        detail: `Oldest waiting ${waitLabel(waited)}`,
        overdueMinutes: waited,
        href: "/leads?bucket=unassigned",
      }),
    );
  }

  if (noNextStep > 0) {
    const idleMinutes = oldestNoNextStep
      ? Math.floor((now.getTime() - oldestNoNextStep.lastActivityAt.getTime()) / 60_000)
      : 0;
    items.push(
      build("leads.no_next_step", {
        count: noNextStep,
        title: `${plural(noNextStep, "active lead")} with no next step booked`,
        detail: idleMinutes ? `Quietest one idle ${waitLabel(idleMinutes)}` : null,
        overdueMinutes: idleMinutes,
        href: "/leads?bucket=open&needs=next_step",
        lines: ["Every live opportunity should have a date in the diary."],
      }),
    );
  }

  const stalledTotal = stalled.reduce((sum, row) => sum + row._count._all, 0);
  if (stalledTotal > 0) {
    const worst = [...stalled].sort((a, b) => b._count._all - a._count._all)[0];
    items.push(
      build("leads.stalled", {
        count: stalledTotal,
        title: `${plural(stalledTotal, "lead")} stuck in one stage`,
        detail: `Mostly ${LEAD_STAGE_META[worst.stage as LeadStage]?.label ?? worst.stage}`,
        overdueMinutes: settings.stageStallDays * 24 * 60,
        href: "/leads/pipeline",
        lines: stalled.map(
          (row) =>
            `${row._count._all} in ${LEAD_STAGE_META[row.stage as LeadStage]?.label ?? row.stage} for over ${settings.stageStallDays} days`,
        ),
      }),
    );
  }

  if (cold > 0) {
    items.push(
      build("leads.cold", {
        count: cold,
        title: `${plural(cold, "lead has", "leads have")} gone cold`,
        detail: `No activity for over ${settings.leadColdDays} days`,
        overdueMinutes: settings.leadColdDays * 24 * 60,
        href: "/leads?bucket=open",
      }),
    );
  }

  return items;
}

/* ----------------------------- FOLLOW-UPS ----------------------------- */

async function followUpActions(
  scope: AttentionScope,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  // Assignment, not branch, is what scopes a task: it is somebody's to do.
  const mine = scope.ownerId ? { assignedToId: scope.ownerId } : {};
  const base = {
    dealerId: scope.dealerId,
    status: "pending",
    ...mine,
    ...(scope.branchIds.length || scope.focusBranchId
      ? { lead: branchFilterNullable(scope) }
      : {}),
  };

  const [overdueCount, oldestOverdue, todayCount, nextToday] = await Promise.all([
    db.followUp.count({ where: { ...base, dueAt: { lt: now } } }),
    db.followUp.findFirst({
      where: { ...base, dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
    // Deliberately excludes anything already overdue — a task due at 5pm is not
    // a failure at 11am, and lumping them together makes the number meaningless.
    db.followUp.count({ where: { ...base, dueAt: { gte: now, lte: dayEnd } } }),
    db.followUp.findFirst({
      where: { ...base, dueAt: { gte: now, lte: dayEnd } },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
  ]);

  if (overdueCount > 0 && oldestOverdue) {
    const late = Math.floor((now.getTime() - oldestOverdue.dueAt.getTime()) / 60_000);
    items.push(
      build("followups.overdue", {
        count: overdueCount,
        priority: late >= 24 * 60 ? "critical" : "high",
        title: `${plural(overdueCount, "follow-up")} overdue`,
        detail: `Oldest ${waitLabel(late)} late`,
        overdueMinutes: late,
        href: "/attention/day?queue=followups",
        cta: "Start follow-ups",
        lines: ["Worked one at a time, most overdue first."],
      }),
    );
  }

  if (todayCount > 0 && nextToday) {
    items.push(
      build("followups.today", {
        count: todayCount,
        title: `${plural(todayCount, "follow-up")} due later today`,
        detail: `Next at ${formatTime(nextToday.dueAt)}`,
        href: "/followups?bucket=today",
      }),
    );
  }

  void dayStart;
  return items;
}

/* ----------------------------- TEST DRIVES ---------------------------- */

async function testDriveActions(
  scope: AttentionScope,
  settings: AttentionSettings,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  const mine = scope.ownerId ? { assignedToId: scope.ownerId } : {};
  const base = {
    dealerId: scope.dealerId,
    ...mine,
    ...branchFilterNullable(scope),
  };

  const soonCutoff = new Date(now.getTime() + settings.testDriveSoonMinutes * 60_000);

  const [soon, nextSoon, todayCount, nextToday, unconfirmed, noShow, feedbackPending] =
    await Promise.all([
      db.testDrive.count({
        where: {
          ...base,
          status: { in: ["requested", "confirmed"] },
          scheduledAt: { gte: now, lte: soonCutoff },
        },
      }),
      db.testDrive.findFirst({
        where: {
          ...base,
          status: { in: ["requested", "confirmed"] },
          scheduledAt: { gte: now, lte: soonCutoff },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          scheduledAt: true,
          customer: { select: { name: true } },
          vehicle: { select: { make: true, model: true, year: true, variant: true } },
        },
      }),
      db.testDrive.count({
        where: {
          ...base,
          status: { in: ["requested", "confirmed"] },
          scheduledAt: { gte: now, lte: dayEnd },
        },
      }),
      db.testDrive.findFirst({
        where: {
          ...base,
          status: { in: ["requested", "confirmed"] },
          scheduledAt: { gte: now, lte: dayEnd },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          scheduledAt: true,
          customer: { select: { name: true } },
        },
      }),
      db.testDrive.count({
        where: { ...base, status: "requested", scheduledAt: { gte: now } },
      }),
      db.testDrive.count({
        where: {
          ...base,
          status: "no_show",
          scheduledAt: { gte: addDays(now, -7), lte: now },
        },
      }),
      db.testDrive.count({
        where: {
          ...base,
          status: "completed",
          feedback: null,
          scheduledAt: { gte: addDays(now, -7), lte: now },
        },
      }),
    ]);

  if (soon > 0 && nextSoon) {
    const minutes = Math.max(0, Math.round((nextSoon.scheduledAt.getTime() - now.getTime()) / 60_000));
    items.push(
      build("testdrives.soon", {
        count: soon,
        title:
          soon === 1
            ? `Test drive in ${waitLabel(minutes)}: ${nextSoon.customer.name}`
            : `${plural(soon, "test drive")} in the next ${waitLabel(settings.testDriveSoonMinutes)}`,
        detail: `${formatTime(nextSoon.scheduledAt)}${nextSoon.vehicle ? ` · ${vehicleTitle(nextSoon.vehicle)}` : ""}`,
        href: "/test-drives",
        // Sooner is more urgent, so invert the countdown into the score.
        overdueMinutes: Math.max(0, settings.testDriveSoonMinutes - minutes),
      }),
    );
  }

  // Only surfaced separately when there are drives later today beyond the
  // imminent ones, so the same booking is never counted in two cards.
  if (todayCount > soon && nextToday) {
    const later = todayCount - soon;
    items.push(
      build("testdrives.today", {
        count: later,
        // "More" only reads correctly when an imminent card sits above it.
        title:
          soon > 0
            ? `${plural(later, "more test drive")} later today`
            : `${plural(later, "test drive")} today`,
        detail: `Next at ${formatTime(nextToday.scheduledAt)}`,
        href: "/test-drives",
      }),
    );
  }

  if (unconfirmed > 0) {
    items.push(
      build("testdrives.unconfirmed", {
        count: unconfirmed,
        title: `${plural(unconfirmed, "test drive")} not confirmed yet`,
        detail: "The customer has not been told it is on",
        href: "/test-drives?status=requested",
      }),
    );
  }

  if (noShow > 0) {
    items.push(
      build("testdrives.no_show", {
        count: noShow,
        title: `${plural(noShow, "customer")} did not turn up`,
        detail: "Worth one call before writing them off",
        href: "/test-drives?status=no_show",
      }),
    );
  }

  if (feedbackPending > 0) {
    items.push(
      build("testdrives.feedback", {
        count: feedbackPending,
        title: `${plural(feedbackPending, "test drive")} with no feedback recorded`,
        detail: "What they thought is the strongest buying signal you have",
        href: "/test-drives?status=completed",
      }),
    );
  }

  void dayStart;
  return items;
}

/* ------------------------------ BOOKINGS ------------------------------ */

async function bookingActions(
  scope: AttentionScope,
  settings: AttentionSettings,
  now: Date,
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  const mine = scope.ownerId ? { salesExecutiveId: scope.ownerId } : {};
  const base = {
    dealerId: scope.dealerId,
    status: "active",
    ...mine,
    ...branchFilterNullable(scope),
  };

  const expiredCutoff = addDays(now, -settings.bookingExpiryDays);
  const expiringCutoff = addDays(now, -(settings.bookingExpiryDays - 3));

  const [expired, expiredValue, expiring, expiringValue, unpaid] = await Promise.all([
    db.booking.count({ where: { ...base, bookedAt: { lt: expiredCutoff } } }),
    db.booking.aggregate({
      where: { ...base, bookedAt: { lt: expiredCutoff } },
      _sum: { bookingAmount: true },
    }),
    db.booking.count({
      where: { ...base, bookedAt: { gte: expiredCutoff, lt: expiringCutoff } },
    }),
    db.booking.aggregate({
      where: { ...base, bookedAt: { gte: expiredCutoff, lt: expiringCutoff } },
      _sum: { bookingAmount: true },
    }),
    db.booking.count({
      where: { ...base, paymentStatus: { in: ["pending", "partial"] }, bookedAt: { lt: addDays(now, -3) } },
    }),
  ]);

  if (expired > 0) {
    const value = expiredValue._sum.bookingAmount ?? 0;
    items.push(
      build("bookings.expired", {
        count: expired,
        title: `${plural(expired, "booking")} past the ${settings.bookingExpiryDays}-day mark`,
        detail: value ? `${formatPrice(value)} in tokens held` : "Convert, extend or release the car",
        value,
        overdueMinutes: settings.bookingExpiryDays * 24 * 60,
        href: "/sales?bucket=expiring",
        lines: ["The car is off the market while this sits. Close it or free it up."],
      }),
    );
  }

  if (expiring > 0) {
    const value = expiringValue._sum.bookingAmount ?? 0;
    items.push(
      build("bookings.expiring", {
        count: expiring,
        title: `${plural(expiring, "booking")} about to lapse`,
        detail: value ? `${formatPrice(value)} in tokens at risk` : "Confirm the customer is still in",
        value,
        href: "/sales?bucket=expiring",
      }),
    );
  }

  if (unpaid > 0) {
    items.push(
      build("bookings.unpaid", {
        count: unpaid,
        title: `${plural(unpaid, "booking")} still not fully paid`,
        detail: "Balance outstanding for more than three days",
        href: "/sales?bucket=unpaid",
      }),
    );
  }

  return items;
}

/* ---------------------------- REQUIREMENTS ---------------------------- */

async function requirementActions(scope: AttentionScope): Promise<ActionItem[]> {
  // Briefs the matching engine has already paired with stock, and which nobody
  // has acted on since. Reuses the existing requirement status rather than
  // inventing a second "reviewed" flag.
  const matched = await db.customerRequirement.count({
    where: {
      dealerId: scope.dealerId,
      status: "matched",
      ...branchFilterNullable(scope),
      ...(scope.ownerId ? { createdById: scope.ownerId } : {}),
    },
  });

  if (!matched) return [];

  return [
    build("requirements.matches", {
      count: matched,
      title: `${plural(matched, "customer is", "customers are")} waiting for a car you now have`,
      detail: "Matched against stock and not contacted yet",
      href: "/requirements?status=matched",
    }),
  ];
}

/* ------------------------------ INVENTORY ----------------------------- */

async function inventoryActions(
  scope: AttentionScope,
  settings: AttentionSettings,
  now: Date,
  bVehicle: Record<string, unknown>,
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  const base = { dealerId: scope.dealerId, ...bVehicle };
  const live = { ...base, status: { in: ["available", "reserved"] } };

  const warnCutoff = addDays(now, -settings.ageingWarnDays);
  const criticalCutoff = addDays(now, -settings.ageingCriticalDays);
  const zeroCutoff = addDays(now, -settings.zeroEnquiryDays);
  const docHorizon = addDays(now, 30);

  const [
    ageingWarn,
    ageingCritical,
    zeroEnquiry,
    docsExpired,
    docsExpiring,
    noPhotos,
    drafts,
    missingDetails,
    underperforming,
  ] = await Promise.all([
    db.vehicle.count({
      where: { ...live, listedAt: { not: null, lte: warnCutoff, gt: criticalCutoff } },
    }),
    db.vehicle.count({ where: { ...live, listedAt: { not: null, lte: criticalCutoff } } }),

    db.vehicle.count({
      where: { ...live, listedAt: { not: null, lte: zeroCutoff }, enquiryCount: 0 },
    }),

    db.vehicle.count({
      where: {
        ...base,
        status: { in: ["available", "reserved", "booked"] },
        OR: [
          { insuranceValidTill: { not: null, lt: now } },
          { fitnessValidTill: { not: null, lt: now } },
          { pucValidTill: { not: null, lt: now } },
        ],
      },
    }),
    db.vehicle.count({
      where: {
        ...base,
        status: { in: ["available", "reserved", "booked"] },
        OR: [
          { insuranceValidTill: { not: null, gte: now, lte: docHorizon } },
          { fitnessValidTill: { not: null, gte: now, lte: docHorizon } },
          { pucValidTill: { not: null, gte: now, lte: docHorizon } },
        ],
      },
    }),

    db.vehicle.count({ where: { ...live, images: { none: { kind: "photo" } } } }),
    db.vehicle.count({ where: { ...base, status: "draft" } }),
    db.vehicle.count({
      where: {
        ...live,
        OR: [
          { registrationNumber: null },
          { registrationState: null },
          { conditionRating: null },
          { description: null },
        ],
      },
    }),

    // Rule-based, not a model: heavily viewed and still barely asked about.
    // Deliberately strict — a rule that flags most of the yard is noise, and
    // cars with no enquiries at all are already covered by their own action.
    db.vehicle.findMany({
      where: { ...live, viewCount: { gte: 150 }, enquiryCount: { gt: 0, lte: 3 } },
      select: { id: true, viewCount: true, enquiryCount: true, stockId: true, make: true, model: true, year: true, variant: true },
      take: 50,
    }),
  ]);

  const ageingTotal = ageingWarn + ageingCritical;
  if (ageingTotal > 0 && scope.can.inventory) {
    items.push(
      build("inventory.ageing", {
        count: ageingTotal,
        priority: ageingCritical > 0 ? "high" : "medium",
        title: `${plural(ageingTotal, "car")} sitting too long`,
        detail:
          ageingCritical > 0
            ? `${ageingCritical} past ${settings.ageingCriticalDays} days`
            : `Over ${settings.ageingWarnDays} days in stock`,
        overdueMinutes: settings.ageingWarnDays * 24 * 60,
        href: "/reports/ageing",
        lines: [
          ageingWarn > 0 ? `${ageingWarn} over ${settings.ageingWarnDays} days` : "",
          ageingCritical > 0 ? `${ageingCritical} over ${settings.ageingCriticalDays} days` : "",
        ].filter(Boolean),
      }),
    );
  }

  if (zeroEnquiry > 0) {
    items.push(
      build("inventory.zero_enquiry", {
        count: zeroEnquiry,
        title: `${plural(zeroEnquiry, "car has", "cars have")} had no enquiries at all`,
        detail: `Live for over ${settings.zeroEnquiryDays} days`,
        href: `/inventory?sort=oldest&status=available`,
        lines: ["Usually the photos, the price, or both."],
      }),
    );
  }

  if (docsExpired > 0) {
    items.push(
      build("documents.expired", {
        count: docsExpired,
        title: `${plural(docsExpired, "car has", "cars have")} an expired document`,
        detail: "A buyer cannot register the car like this",
        href: "/inventory?docs=expired",
      }),
    );
  }

  if (docsExpiring > 0) {
    items.push(
      build("documents.expiring", {
        count: docsExpiring,
        title: `${plural(docsExpiring, "document")} expiring within a month`,
        detail: "Insurance, fitness or PUC",
        href: "/inventory?docs=expiring",
      }),
    );
  }

  if (noPhotos > 0 && scope.can.inventoryEdit) {
    items.push(
      build("quality.no_photos", {
        count: noPhotos,
        title: `${plural(noPhotos, "live car has", "live cars have")} no photos`,
        detail: "These get almost no enquiries",
        href: "/inventory?missing=photos",
      }),
    );
  }

  if (drafts > 0 && scope.can.inventoryEdit) {
    items.push(
      build("quality.draft", {
        count: drafts,
        title: `${plural(drafts, "car is", "cars are")} still in draft`,
        detail: "Not visible on your website yet",
        href: "/inventory?status=draft",
      }),
    );
  }

  if (missingDetails > 0 && scope.can.inventoryEdit) {
    items.push(
      build("quality.missing_details", {
        count: missingDetails,
        title: `${plural(missingDetails, "listing is", "listings are")} missing key details`,
        detail: "Registration, condition or description",
        href: "/inventory?missing=details",
      }),
    );
  }

  // Worse than one enquiry per fifty views is the line where the listing, not
  // the market, is the problem.
  const poorConverters = underperforming
    .filter((v) => v.enquiryCount * 50 < v.viewCount)
    .sort((a, b) => b.viewCount - a.viewCount);
  if (poorConverters.length > 0) {
    const worst = poorConverters[0];
    items.push(
      build("inventory.underperforming", {
        count: poorConverters.length,
        title: `${plural(poorConverters.length, "car is", "cars are")} getting looked at but not asked about`,
        detail: `${worst.stockId} — ${worst.viewCount} views, only ${plural(worst.enquiryCount, "enquiry", "enquiries")}`,
        href: "/inventory?sort=views",
        lines: poorConverters
          .slice(0, 4)
          .map((v) => `${vehicleTitle(v)} — ${v.viewCount} views, ${plural(v.enquiryCount, "enquiry", "enquiries")}`),
      }),
    );
  }

  return items;
}

/* -------------------------------- TEAM -------------------------------- */

async function teamActions(scope: AttentionScope, now: Date): Promise<ActionItem[]> {
  // Managers only, and phrased as workload rather than blame. Nothing here is
  // visible to the person it is about unless they are also a manager.
  const overdue = await db.followUp.groupBy({
    by: ["assignedToId"],
    where: {
      dealerId: scope.dealerId,
      status: "pending",
      dueAt: { lt: now },
      assignedToId: { not: null },
      ...(scope.branchIds.length || scope.focusBranchId
        ? { lead: branchFilterNullable(scope) }
        : {}),
    },
    _count: { _all: true },
  });

  const heavy = overdue.filter((row) => row._count._all >= 5);
  if (!heavy.length) return [];

  const users = await db.user.findMany({
    where: { id: { in: heavy.map((h) => h.assignedToId!) }, dealerId: scope.dealerId },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const worst = [...heavy].sort((a, b) => b._count._all - a._count._all)[0];

  return [
    build("team.workload", {
      count: heavy.length,
      title:
        heavy.length === 1
          ? `${nameById.get(worst.assignedToId!) ?? "A colleague"} has ${worst._count._all} overdue follow-ups`
          : `${plural(heavy.length, "person is", "people are")} behind on follow-ups`,
      detail: `Most behind: ${nameById.get(worst.assignedToId!) ?? "unknown"} (${worst._count._all})`,
      href: "/reports?view=staff",
      lines: heavy
        .slice(0, 5)
        .map((row) => `${nameById.get(row.assignedToId!) ?? "Unknown"} — ${row._count._all} overdue`),
    }),
  ];
}

/* ----------------------------- DISMISSALS ----------------------------- */

/**
 * Removes items this person has hidden or postponed.
 *
 * A dismissal only holds while the situation is unchanged: the stored
 * `stateHash` carries the priority and count at the time, so an item that grows
 * or escalates comes straight back. Critical items are never hideable at all,
 * which is enforced here as well as in the UI.
 */
async function applyDismissals(
  scope: AttentionScope,
  items: ActionItem[],
  now: Date,
): Promise<ActionItem[]> {
  if (!items.length) return items;

  const rows = await db.actionDismissal.findMany({
    where: { userId: scope.userId, actionKey: { in: items.map((i) => i.id) } },
  });
  if (!rows.length) return items;

  const byKey = new Map(rows.map((r) => [r.actionKey, r]));
  const stale: string[] = [];

  const visible = items.filter((item) => {
    const row = byKey.get(item.id);
    if (!row) return true;

    // Snooze ran out.
    if (row.snoozedUntil && row.snoozedUntil <= now) {
      stale.push(row.id);
      return true;
    }
    // It got worse, or it is critical now — the dismissal no longer applies.
    if (row.stateHash !== item.stateHash || item.priority === "critical") {
      stale.push(row.id);
      return true;
    }
    return false;
  });

  if (stale.length) {
    await db.actionDismissal.deleteMany({ where: { id: { in: stale } } });
  }

  return visible;
}

/* -------------------------- START MY DAY QUEUE ------------------------ */

export type QueueTask = {
  id: string;
  kind: "followup" | "lead" | "testdrive" | "booking" | "requirement";
  priority: ActionPriority;
  title: string;
  subtitle: string;
  /** Why this is in front of you, in one line. */
  reason: string;
  customerName: string;
  phone: string | null;
  leadId: string | null;
  followUpId: string | null;
  vehicle: string | null;
  href: string;
  dueAt: string | null;
};

/**
 * The ordered task list behind "Start my day".
 *
 * Built from the same live state as the cards, ordered so the salesperson never
 * has to decide what to open next: what is on fire, then what is late, then what
 * is scheduled, then what is merely worth doing.
 */
export async function getDayQueue(
  rawScope: AttentionScope,
  opts: { limit?: number; only?: "followups" | "all" } = {},
): Promise<QueueTask[]> {
  const scope: AttentionScope = {
    ...rawScope,
    focusBranchId: await resolveFocusBranch(rawScope),
  };

  const settings = await getAttentionSettings(scope.dealerId);
  const now = new Date();
  const dayEnd = endOfDay(now);
  const limit = opts.limit ?? 40;
  const onlyFollowUps = opts.only === "followups";

  const mine = scope.ownerId ? { assignedToId: scope.ownerId } : {};
  const leadBranch = branchFilterNullable(scope);

  const [overdue, dueToday, uncontacted, testDrives] = await Promise.all([
    db.followUp.findMany({
      where: {
        dealerId: scope.dealerId,
        status: "pending",
        dueAt: { lt: now },
        ...mine,
        ...(scope.branchIds.length || scope.focusBranchId ? { lead: leadBranch } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            reference: true,
            stage: true,
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { make: true, model: true, year: true, variant: true } },
          },
        },
      },
    }),

    db.followUp.findMany({
      where: {
        dealerId: scope.dealerId,
        status: "pending",
        dueAt: { gte: now, lte: dayEnd },
        ...mine,
        ...(scope.branchIds.length || scope.focusBranchId ? { lead: leadBranch } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            reference: true,
            stage: true,
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { make: true, model: true, year: true, variant: true } },
          },
        },
      },
    }),

    onlyFollowUps
      ? []
      : db.lead.findMany({
          where: {
            dealerId: scope.dealerId,
            firstResponseAt: null,
            stage: { notIn: CLOSED_STAGES },
            createdAt: { lte: new Date(now.getTime() - settings.attention * 60_000) },
            ...leadBranch,
            ...(scope.ownerId ? { ownerId: scope.ownerId } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: {
            id: true,
            reference: true,
            createdAt: true,
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { make: true, model: true, year: true, variant: true } },
          },
        }),

    onlyFollowUps
      ? []
      : db.testDrive.findMany({
          where: {
            dealerId: scope.dealerId,
            status: { in: ["requested", "confirmed"] },
            scheduledAt: { gte: now, lte: dayEnd },
            ...mine,
            ...leadBranch,
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            leadId: true,
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { make: true, model: true, year: true, variant: true } },
          },
        }),
  ]);

  const tasks: QueueTask[] = [];

  for (const lead of uncontacted) {
    const waited = Math.floor((now.getTime() - lead.createdAt.getTime()) / 60_000);
    const { priority } = slaBand(waited, settings);
    tasks.push({
      id: `lead:${lead.id}`,
      kind: "lead",
      priority: waited >= settings.critical ? "critical" : priority === "low" ? "medium" : priority,
      title: lead.customer.name,
      subtitle: lead.vehicle ? vehicleTitle(lead.vehicle) : "General enquiry",
      reason: `Enquired ${waitLabel(waited)} ago and nobody has replied`,
      customerName: lead.customer.name,
      phone: lead.customer.phone,
      leadId: lead.id,
      followUpId: null,
      vehicle: lead.vehicle ? vehicleTitle(lead.vehicle) : null,
      href: `/leads/${lead.id}`,
      dueAt: null,
    });
  }

  for (const td of testDrives) {
    const minutes = Math.round((td.scheduledAt.getTime() - now.getTime()) / 60_000);
    tasks.push({
      id: `testdrive:${td.id}`,
      kind: "testdrive",
      priority: minutes <= settings.testDriveSoonMinutes ? "critical" : "high",
      title: td.customer.name,
      subtitle: td.vehicle ? vehicleTitle(td.vehicle) : "Test drive",
      reason:
        td.status === "requested"
          ? `Test drive at ${formatTime(td.scheduledAt)} — still not confirmed`
          : `Test drive at ${formatTime(td.scheduledAt)}, in ${waitLabel(minutes)}`,
      customerName: td.customer.name,
      phone: td.customer.phone,
      leadId: td.leadId,
      followUpId: null,
      vehicle: td.vehicle ? vehicleTitle(td.vehicle) : null,
      href: "/test-drives",
      dueAt: td.scheduledAt.toISOString(),
    });
  }

  for (const f of overdue) {
    const late = Math.floor((now.getTime() - f.dueAt.getTime()) / 60_000);
    tasks.push({
      id: `followup:${f.id}`,
      kind: "followup",
      priority: late >= 24 * 60 ? "critical" : "high",
      title: f.lead.customer.name,
      subtitle: f.lead.vehicle ? vehicleTitle(f.lead.vehicle) : f.lead.reference,
      reason: `${f.type.replace(/_/g, " ")} follow-up ${waitLabel(late)} overdue`,
      customerName: f.lead.customer.name,
      phone: f.lead.customer.phone,
      leadId: f.lead.id,
      followUpId: f.id,
      vehicle: f.lead.vehicle ? vehicleTitle(f.lead.vehicle) : null,
      href: `/leads/${f.lead.id}`,
      dueAt: f.dueAt.toISOString(),
    });
  }

  for (const f of dueToday) {
    tasks.push({
      id: `followup:${f.id}`,
      kind: "followup",
      priority: "medium",
      title: f.lead.customer.name,
      subtitle: f.lead.vehicle ? vehicleTitle(f.lead.vehicle) : f.lead.reference,
      reason: `${f.type.replace(/_/g, " ")} follow-up due at ${formatTime(f.dueAt)}`,
      customerName: f.lead.customer.name,
      phone: f.lead.customer.phone,
      leadId: f.lead.id,
      followUpId: f.id,
      vehicle: f.lead.vehicle ? vehicleTitle(f.lead.vehicle) : null,
      href: `/leads/${f.lead.id}`,
      dueAt: f.dueAt.toISOString(),
    });
  }

  const rank: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const byPriority = rank[a.priority] - rank[b.priority];
    if (byPriority !== 0) return byPriority;
    // Then whatever is furthest past its moment, or soonest to arrive.
    const at = a.dueAt ? new Date(a.dueAt).getTime() : 0;
    const bt = b.dueAt ? new Date(b.dueAt).getTime() : 0;
    return at - bt;
  });

  // The same customer twice in a row is confusing; keep only the first task per
  // lead so the queue moves through people, not rows.
  const seen = new Set<string>();
  return tasks
    .filter((t) => {
      const dedupeOn = t.leadId ?? t.id;
      if (seen.has(dedupeOn)) return false;
      seen.add(dedupeOn);
      return true;
    })
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* OPERATIONS METRICS                                                  */
/* ------------------------------------------------------------------ */

export type OperationsMetrics = {
  windowDays: number;
  /** Enquiries that arrived in the window and have since been answered. */
  answered: number;
  /** Enquiries in the window still waiting for a first reply. */
  unanswered: number;
  /** Median is used rather than the mean: one forgotten lead should not
   *  make an otherwise sharp team look slow. */
  responseMedianMinutes: number | null;
  responseAverageMinutes: number | null;
  /** Share of enquiries answered inside the dealership's own promise. */
  slaCompliancePct: number | null;
  slaTargetMinutes: number;

  /** Right now, not over the window — this is the size of the backlog. */
  uncontactedNow: number;
  overdueFollowUpsNow: number;

  /** Follow-ups completed in the window. */
  followUpsCompleted: number;
  followUpsOnTime: number;
  followUpOnTimePct: number | null;
  /** For the ones done late: how long after the due time, on average. */
  followUpMedianLatenessMinutes: number | null;

  /** Cars sold in the window, and how long they sat first. */
  soldCount: number;
  medianDaysToSell: number | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The handful of operational numbers that actually change behaviour: how fast
 * enquiries get answered, whether the team keeps its own promise, how much work
 * is sitting undone right now, and how long stock takes to move.
 *
 * Deliberately not a vanity dashboard — every figure here maps to something a
 * manager can do something about on Monday morning.
 */
export async function getOperationsMetrics(
  rawScope: AttentionScope,
  windowDays = 30,
): Promise<OperationsMetrics> {
  const scope: AttentionScope = {
    ...rawScope,
    focusBranchId: await resolveFocusBranch(rawScope),
  };
  const settings = await getAttentionSettings(scope.dealerId);
  const now = new Date();
  const from = addDays(now, -windowDays);

  const bLead = branchFilterNullable(scope);
  const owner = scope.ownerId ? { ownerId: scope.ownerId } : {};
  const leadBase = { dealerId: scope.dealerId, ...bLead, ...owner };

  const followUpBase = {
    dealerId: scope.dealerId,
    ...(scope.ownerId ? { assignedToId: scope.ownerId } : {}),
    ...(scope.branchIds.length || scope.focusBranchId ? { lead: bLead } : {}),
  };

  const [answeredLeads, unanswered, uncontactedNow, overdueNow, completed, sold] =
    await Promise.all([
      db.lead.findMany({
        where: { ...leadBase, createdAt: { gte: from }, firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
        take: 2000,
      }),
      db.lead.count({
        where: {
          ...leadBase,
          createdAt: { gte: from },
          firstResponseAt: null,
          stage: { notIn: CLOSED_STAGES },
        },
      }),

      db.lead.count({
        where: {
          ...leadBase,
          firstResponseAt: null,
          stage: { notIn: CLOSED_STAGES },
          createdAt: { lte: new Date(now.getTime() - settings.attention * 60_000) },
        },
      }),
      db.followUp.count({ where: { ...followUpBase, status: "pending", dueAt: { lt: now } } }),

      db.followUp.findMany({
        where: {
          ...followUpBase,
          status: "done",
          completedAt: { gte: from, not: null },
        },
        select: { dueAt: true, completedAt: true },
        take: 2000,
      }),

      db.sale.findMany({
        where: {
          dealerId: scope.dealerId,
          soldAt: { gte: from },
          ...(scope.branchIds.length || scope.focusBranchId ? branchFilter(scope) : {}),
        },
        select: { soldAt: true, vehicle: { select: { listedAt: true, createdAt: true } } },
        take: 2000,
      }),
    ]);

  const responseMinutes = answeredLeads.map((l) =>
    Math.max(0, Math.round((l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 60_000)),
  );

  const withinTarget = responseMinutes.filter((m) => m <= settings.high).length;

  const lateness = completed
    .filter((f) => f.completedAt && f.completedAt > f.dueAt)
    .map((f) => Math.round((f.completedAt!.getTime() - f.dueAt.getTime()) / 60_000));

  const daysToSell = sold
    .map((s) => {
      const listed = s.vehicle.listedAt ?? s.vehicle.createdAt;
      return Math.max(0, Math.round((s.soldAt.getTime() - listed.getTime()) / 86_400_000));
    })
    .filter((d) => Number.isFinite(d));

  return {
    windowDays,
    answered: answeredLeads.length,
    unanswered,
    responseMedianMinutes: median(responseMinutes),
    responseAverageMinutes: responseMinutes.length
      ? Math.round(responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length)
      : null,
    slaCompliancePct: responseMinutes.length
      ? Math.round((withinTarget / responseMinutes.length) * 100)
      : null,
    slaTargetMinutes: settings.high,

    uncontactedNow,
    overdueFollowUpsNow: overdueNow,

    followUpsCompleted: completed.length,
    followUpsOnTime: completed.length - lateness.length,
    followUpOnTimePct: completed.length
      ? Math.round(((completed.length - lateness.length) / completed.length) * 100)
      : null,
    followUpMedianLatenessMinutes: median(lateness),

    soldCount: sold.length,
    medianDaysToSell: median(daysToSell),
  };
}
