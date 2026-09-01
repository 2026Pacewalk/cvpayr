import "server-only";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import type { PermissionKey } from "@/lib/permissions";
import { sendEmail, sendWhatsApp, emailConfigured, whatsappApiConfigured } from "@/lib/channels";
import {
  typeMeta,
  shouldDeliver,
  isQuietHour,
  DEFAULT_PREFERENCE,
  type DeliveryPreference,
  type NotificationPriority,
} from "@/lib/notifications";

/**
 * The notification engine.
 *
 * Rules that hold for every notification written through this module:
 *
 *  1. `dealerId` always comes from a trusted server context, never from input.
 *     A dealer can therefore never write into another dealer's inbox.
 *  2. Recipients are resolved from role permissions and branch membership on the
 *     server. Branch-restricted staff are filtered out before the row is written,
 *     not hidden afterwards in the UI.
 *  3. The person who caused an event is not told about their own action.
 *  4. A `dedupeKey` makes writes idempotent, so the scheduled sweep can run every
 *     few minutes without producing repeats.
 *  5. Muting and priority floors are per-user preferences applied here, except
 *     for `alwaysOn` types which cannot be silenced.
 */

/* ---------------------------- PREFERENCES ---------------------------- */

type PrefRow = {
  inApp: boolean;
  browserPush: boolean;
  email: boolean;
  whatsapp: boolean;
  sound: boolean;
  mutedTypes: string;
  minPriority: string;
  quietStart: number | null;
  quietEnd: number | null;
};

function toPreference(row: PrefRow | null): DeliveryPreference {
  if (!row) return DEFAULT_PREFERENCE;
  return {
    inApp: row.inApp,
    browserPush: row.browserPush,
    email: row.email,
    whatsapp: row.whatsapp,
    sound: row.sound,
    mutedTypes: safeJsonParse<string[]>(row.mutedTypes, []),
    minPriority: row.minPriority,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
  };
}

export async function getPreference(userId: string): Promise<DeliveryPreference> {
  const row = await db.notificationPreference.findUnique({ where: { userId } });
  return toPreference(row);
}

async function getPreferences(userIds: string[]): Promise<Map<string, DeliveryPreference>> {
  if (!userIds.length) return new Map();
  const rows = await db.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  });
  const byUser = new Map(rows.map((r) => [r.userId, toPreference(r)]));
  for (const id of userIds) if (!byUser.has(id)) byUser.set(id, DEFAULT_PREFERENCE);
  return byUser;
}

/* ------------------------------ WRITING ------------------------------ */

export type NotifyInput = {
  dealerId: string;
  /** Target user. `null` writes a dealer-wide broadcast row. */
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Overrides the catalogue default — e.g. an overdue item that got worse. */
  priority?: NotificationPriority;
  branchId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Whoever triggered it. Never notified about their own action. */
  actorId?: string | null;
  /** Idempotency key, unique per dealer. Repeats are skipped. */
  dedupeKey?: string | null;
  /** Structured payload for quick actions. Serialised to JSON. */
  meta?: Record<string, unknown> | null;
  /** Auto-delete after this moment. Defaults to the retention window. */
  expiresAt?: Date | null;
  /** Kept for call sites written before delivery channels existed. */
  channels?: string[];
};

/** How long a notification is kept before the retention sweep removes it. */
const RETENTION_DAYS = 90;

/**
 * Writes one notification. Returns the row, or `null` when it was suppressed
 * (duplicate, muted, or the actor is the recipient).
 */
export async function notify(input: NotifyInput) {
  const meta = typeMeta(input.type);
  const priority = input.priority ?? meta.priority;

  // Never tell someone about something they just did themselves.
  if (input.actorId && input.userId && input.actorId === input.userId) return null;

  if (input.userId) {
    const pref = await getPreference(input.userId);
    if (!shouldDeliver(input.type, priority, pref)) return null;
  }

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + RETENTION_DAYS * 24 * 3600 * 1000);

  const data = {
    dealerId: input.dealerId,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    priority,
    category: meta.category,
    branchId: input.branchId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    actorId: input.actorId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    expiresAt,
  };

  // Idempotency. Two sweeps racing on the same key must not both write.
  if (input.dedupeKey) {
    try {
      const row = await db.notification.create({ data });
      await dispatchExternal(row);
      return row;
    } catch {
      return null; // unique([dealerId, dedupeKey]) rejected it — already sent
    }
  }

  const created = await db.notification.create({ data });
  await dispatchExternal(created);
  return created;
}

/**
 * Attempts the opt-in channels for a notification that was just written.
 *
 * Nothing is attempted unless a provider is genuinely configured and the user
 * asked for that channel, so the app never implies a message was sent when no
 * provider exists. Failures are logged and swallowed: a dead email provider
 * must never stop a lead from being recorded.
 */
async function dispatchExternal(notification: {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: string;
}) {
  if (!notification.userId) return;
  if (!emailConfigured() && !whatsappApiConfigured()) return;

  // Only things worth interrupting someone outside the app for.
  if (!["critical", "high"].includes(notification.priority)) return;

  const [pref, user] = await Promise.all([
    getPreference(notification.userId),
    db.user.findUnique({
      where: { id: notification.userId },
      select: { email: true, whatsapp: true, phone: true },
    }),
  ]);
  if (!user) return;

  if (pref.email && emailConfigured() && user.email) {
    const base = process.env.APP_URL ?? "";
    const result = await sendEmail({
      to: user.email,
      subject: notification.title,
      text: [notification.body, notification.link ? `${base}${notification.link}` : null]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (!result.sent) {
      console.warn("[notify] email not sent", notification.id, result.reason, result.detail);
    }
  }

  if (pref.whatsapp && whatsappApiConfigured()) {
    const to = user.whatsapp ?? user.phone;
    const template = process.env.WHATSAPP_ALERT_TEMPLATE;
    if (to && template) {
      const result = await sendWhatsApp({
        to,
        template,
        parameters: [notification.title, notification.body ?? ""],
      });
      if (!result.sent) {
        console.warn("[notify] whatsapp not sent", notification.id, result.reason, result.detail);
      }
    }
  }
}

/** Writes several notifications, skipping the ones that are suppressed. */
export async function notifyAll(inputs: NotifyInput[]) {
  const results = await Promise.all(inputs.map((i) => notify(i)));
  return results.filter(Boolean).length;
}

/* --------------------------- RECIPIENT ROUTING ------------------------ */

export type RecipientQuery = {
  dealerId: string;
  /** Anyone whose role grants at least one of these permission keys. */
  permissions?: PermissionKey[];
  /** Or match role keys directly, for cases with no matching permission. */
  roleKeys?: string[];
  /**
   * Restrict to staff who can act on this branch: either branch-wide users
   * (no UserBranch rows) or members of this branch.
   */
  branchId?: string | null;
  /** Always include these users, whatever their role. */
  includeUserIds?: (string | null | undefined)[];
  /** Never include these — normally the person who caused the event. */
  excludeUserIds?: (string | null | undefined)[];
};

/**
 * Resolves who should receive a notification. Permission matching reads the
 * role's stored permission array, so a dealer who edits a custom role changes
 * routing without a code change.
 */
export async function resolveRecipients(q: RecipientQuery): Promise<string[]> {
  const ids = new Set<string>();

  const forced = (q.includeUserIds ?? []).filter(Boolean) as string[];
  if (forced.length) {
    // Confirm each forced user really belongs to this dealer before trusting it.
    const owned = await db.user.findMany({
      where: { id: { in: forced }, dealerId: q.dealerId, isActive: true },
      select: { id: true },
    });
    for (const u of owned) ids.add(u.id);
  }

  if (q.permissions?.length || q.roleKeys?.length) {
    const candidates = await db.user.findMany({
      where: {
        dealerId: q.dealerId,
        isActive: true,
        ...(q.roleKeys?.length ? { role: { key: { in: q.roleKeys } } } : {}),
        ...(q.branchId
          ? {
              OR: [
                { branches: { none: {} } },
                { branches: { some: { branchId: q.branchId } } },
              ],
            }
          : {}),
      },
      select: { id: true, role: { select: { permissions: true } } },
    });

    for (const u of candidates) {
      if (!q.permissions?.length) {
        ids.add(u.id);
        continue;
      }
      const held = safeJsonParse<string[]>(u.role?.permissions ?? "[]", []);
      if (q.permissions.some((p) => held.includes(p))) ids.add(u.id);
    }
  }

  for (const excluded of q.excludeUserIds ?? []) {
    if (excluded) ids.delete(excluded);
  }

  return [...ids];
}

/**
 * The main entry point for event-driven notifications: resolve the audience,
 * then write one row per person so read state and preferences are per-user.
 */
export async function notifyRecipients(
  q: RecipientQuery,
  payload: Omit<NotifyInput, "dealerId" | "userId">,
) {
  const userIds = await resolveRecipients({
    ...q,
    excludeUserIds: [...(q.excludeUserIds ?? []), payload.actorId],
  });
  if (!userIds.length) return 0;

  const prefs = await getPreferences(userIds);
  const priority = payload.priority ?? typeMeta(payload.type).priority;

  const deliverable = userIds.filter((id) =>
    shouldDeliver(payload.type, priority, prefs.get(id) ?? DEFAULT_PREFERENCE),
  );

  return notifyAll(
    deliverable.map((userId) => ({
      ...payload,
      dealerId: q.dealerId,
      userId,
      branchId: payload.branchId ?? q.branchId ?? null,
      // The dedupe key must be per-recipient or only the first person gets it.
      dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : null,
    })),
  );
}

/** Kept for existing call sites that route by role key. */
export async function notifyRoles(input: {
  dealerId: string;
  roleKeys: string[];
  type: string;
  title: string;
  body?: string;
  link?: string;
  branchId?: string | null;
  actorId?: string | null;
}) {
  const { dealerId, roleKeys, branchId, ...payload } = input;
  return notifyRecipients({ dealerId, roleKeys, branchId }, payload);
}

/**
 * Platform staff notifications.
 *
 * `Notification.dealerId` is required, and super admins have no dealership of
 * their own, so the row is stored against the dealership it concerns with the
 * admin as the recipient. Reads for platform staff go through
 * `superAdminInboxWhere`, which matches on `userId` across every tenant.
 *
 * Callers must pass only non-private facts — a dealership name, a plan, a date.
 * Nothing about that dealer's leads, customers or revenue crosses over.
 */
export async function notifySuperAdmins(payload: {
  /** The dealership the notice is about. */
  dealerId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  priority?: NotificationPriority;
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
}) {
  const admins = await db.user.findMany({
    where: { isSuperAdmin: true, isActive: true },
    select: { id: true },
  });
  if (!admins.length) return 0;

  const { dealerId, ...rest } = payload;

  return notifyAll(
    admins.map((a) => ({
      ...rest,
      dealerId,
      userId: a.id,
      dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${a.id}` : null,
    })),
  );
}

/**
 * Platform staff see notices addressed to them across every tenant. Safe because
 * a super admin already has full cross-tenant access by definition; a dealer
 * user can never reach this function.
 */
export function superAdminInboxWhere(userId: string) {
  return { userId };
}

export async function superAdminUnread(userId: string) {
  return db.notification.count({ where: { userId, isRead: false } });
}

/* ------------------------------ READING ------------------------------ */

export type InboxScope = {
  dealerId: string;
  userId: string;
  /** Empty means "all branches of the dealer". */
  branchIds: string[];
};

/**
 * The one place that decides what a user may see. Every read goes through this
 * so branch isolation cannot be forgotten on a new screen.
 */
export function inboxWhere(scope: InboxScope) {
  return {
    dealerId: scope.dealerId,
    // Addressed to me, or a dealer-wide broadcast.
    OR: [{ userId: scope.userId }, { userId: null }],
    // Branch-restricted staff never see another branch's events.
    ...(scope.branchIds.length
      ? { AND: [{ OR: [{ branchId: null }, { branchId: { in: scope.branchIds } }] }] }
      : {}),
  };
}

export async function unreadCount(scope: InboxScope) {
  return db.notification.count({
    where: { ...inboxWhere(scope), isRead: false },
  });
}

export type InboxFilter = {
  unreadOnly?: boolean;
  category?: string;
  priority?: string;
  type?: string;
  since?: Date;
};

export async function listNotifications(
  scope: InboxScope,
  filter: InboxFilter = {},
  page = { skip: 0, take: 30 },
) {
  const where = {
    ...inboxWhere(scope),
    ...(filter.unreadOnly ? { isRead: false } : {}),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
  };

  const [items, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
    }),
    db.notification.count({ where }),
  ]);

  return { items, total };
}

/** Counts for the filter chips, in one round trip. */
export async function inboxCounts(scope: InboxScope) {
  const base = inboxWhere(scope);
  const [all, unread, critical, byCategory] = await Promise.all([
    db.notification.count({ where: base }),
    db.notification.count({ where: { ...base, isRead: false } }),
    db.notification.count({ where: { ...base, isRead: false, priority: "critical" } }),
    db.notification.groupBy({
      by: ["category"],
      where: { ...base, isRead: false },
      _count: { _all: true },
    }),
  ]);

  return {
    all,
    unread,
    critical,
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
  };
}

/* ------------------------------ MUTATION ------------------------------ */

/** Marks specific rows, or everything the user can see, as read. */
export async function markRead(scope: InboxScope, ids?: string[]) {
  const result = await db.notification.updateMany({
    where: {
      ...inboxWhere(scope),
      isRead: false,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function markUnread(scope: InboxScope, id: string) {
  const result = await db.notification.updateMany({
    where: { ...inboxWhere(scope), id },
    data: { isRead: false, readAt: null },
  });
  return result.count;
}

export async function deleteNotification(scope: InboxScope, id: string) {
  const result = await db.notification.deleteMany({
    where: { ...inboxWhere(scope), id, userId: scope.userId },
  });
  return result.count;
}

/** Removes rows past their retention date. Called by the scheduled sweep. */
export async function purgeExpired() {
  const result = await db.notification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/* ---------------------------- QUIET HOURS ---------------------------- */

/**
 * Whether a browser push / sound should fire right now for this user. In-app
 * rows are always written; quiet hours only suppress the interruption.
 */
export function shouldInterrupt(
  priority: string,
  pref: DeliveryPreference,
  now = new Date(),
): boolean {
  if (priority === "critical") return true;
  const istHour = new Date(now.getTime() + 5.5 * 3600 * 1000).getUTCHours();
  return !isQuietHour(istHour, pref.quietStart, pref.quietEnd);
}
