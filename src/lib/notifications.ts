/**
 * The notification catalogue.
 *
 * Pure and client-safe: no database, no `server-only`. Both the server engine
 * and the UI read from here so a type can never be worded, coloured, prioritised
 * or routed differently in two places.
 *
 * Every type string that already existed in the database is kept, so historical
 * rows keep rendering correctly.
 */

import type { BadgeTone } from "@/lib/constants";

/* ------------------------------ PRIORITY ------------------------------ */

export const NOTIFICATION_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const PRIORITY_META: Record<
  NotificationPriority,
  { label: string; tone: BadgeTone; rank: number; help: string }
> = {
  critical: {
    label: "Critical",
    tone: "danger",
    rank: 0,
    help: "Money or a customer is about to be lost. Delivered even during quiet hours.",
  },
  high: {
    label: "High",
    tone: "warning",
    rank: 1,
    help: "Needs action today.",
  },
  medium: {
    label: "Medium",
    tone: "info",
    rank: 2,
    help: "Worth knowing, not urgent.",
  },
  low: {
    label: "Low",
    tone: "neutral",
    rank: 3,
    help: "Background activity.",
  },
};

export function priorityRank(p: string): number {
  return PRIORITY_META[p as NotificationPriority]?.rank ?? 2;
}

/** True when `priority` is at least as important as the user's floor. */
export function meetsMinPriority(priority: string, minPriority: string): boolean {
  return priorityRank(priority) <= priorityRank(minPriority);
}

/* ------------------------------ CATEGORY ------------------------------ */

export const NOTIFICATION_CATEGORIES = [
  "lead",
  "followup",
  "testdrive",
  "booking",
  "inventory",
  "requirement",
  "staff",
  "system",
  "general",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: IconKey }> = {
  lead: { label: "Leads", icon: "userPlus" },
  followup: { label: "Follow-ups", icon: "clock" },
  testdrive: { label: "Test drives", icon: "car" },
  booking: { label: "Bookings & sales", icon: "handshake" },
  inventory: { label: "Inventory", icon: "car" },
  requirement: { label: "Requirements", icon: "target" },
  staff: { label: "Staff & access", icon: "users" },
  system: { label: "System", icon: "settings" },
  general: { label: "Other", icon: "bell" },
};

/* -------------------------------- TYPES -------------------------------- */

/**
 * Icon keys, resolved to lucide components in the UI. Kept as strings so this
 * module stays free of React imports and can be used on the server.
 */
export type IconKey =
  | "bell"
  | "userPlus"
  | "users"
  | "clock"
  | "alarm"
  | "car"
  | "handshake"
  | "target"
  | "shieldAlert"
  | "fileWarning"
  | "tag"
  | "share"
  | "settings"
  | "trendingDown"
  | "building";

export type NotificationTypeMeta = {
  /** Short human label, used in filters and the preferences screen. */
  label: string;
  category: NotificationCategory;
  /** Default priority. A call site may raise it (e.g. an older overdue item). */
  priority: NotificationPriority;
  icon: IconKey;
  /** Explains to a dealer what triggers it. Shown on the preferences screen. */
  description: string;
  /** Produced by the scheduled engine rather than a user action. */
  scheduled?: boolean;
  /** Cannot be muted — losing it would mean losing money or breaking security. */
  alwaysOn?: boolean;
};

export const NOTIFICATION_TYPES = {
  /* ---- Leads ---- */
  "lead.new": {
    label: "New enquiry",
    category: "lead",
    priority: "high",
    icon: "userPlus",
    description: "A customer enquires from your website, a shared catalog or a walk-in.",
    alwaysOn: true,
  },
  "lead.assigned": {
    label: "Lead assigned to me",
    category: "lead",
    priority: "high",
    icon: "userPlus",
    description: "A lead is handed to you by a manager or by round-robin.",
    alwaysOn: true,
  },
  "lead.unassigned": {
    label: "Lead waiting for an owner",
    category: "lead",
    priority: "high",
    icon: "userPlus",
    description: "An enquiry has had no owner for a while. Goes to managers.",
    scheduled: true,
  },
  "lead.sla_warning": {
    label: "Enquiry not answered in 30 minutes",
    category: "lead",
    priority: "high",
    icon: "alarm",
    description: "First response is overdue. Goes to the owner.",
    scheduled: true,
  },
  "lead.sla_breach": {
    label: "Enquiry not answered in 1 hour",
    category: "lead",
    priority: "critical",
    icon: "alarm",
    description: "Response time breached. Goes to the owner and their manager.",
    scheduled: true,
    alwaysOn: true,
  },
  "lead.sla_escalation": {
    label: "Enquiry escalated",
    category: "lead",
    priority: "critical",
    icon: "shieldAlert",
    description: "Still unanswered after 3 hours. Goes to the owner's manager and the dealership owner.",
    scheduled: true,
    alwaysOn: true,
  },
  "lead.stale": {
    label: "Lead has gone quiet",
    category: "lead",
    priority: "medium",
    icon: "trendingDown",
    description: "An open lead with no activity for 7 days.",
    scheduled: true,
  },

  /* ---- Follow-ups ---- */
  "followup.due": {
    label: "Follow-up due",
    category: "followup",
    priority: "high",
    icon: "clock",
    description: "A follow-up you scheduled is due today.",
    scheduled: true,
  },
  "followup.overdue": {
    label: "Follow-up overdue",
    category: "followup",
    priority: "critical",
    icon: "alarm",
    description: "A follow-up passed its due time without being completed.",
    scheduled: true,
    alwaysOn: true,
  },
  "followup.summary": {
    label: "Daily plan",
    category: "followup",
    priority: "medium",
    icon: "clock",
    description: "One morning summary of everything due today.",
    scheduled: true,
  },

  /* ---- Test drives ---- */
  "testdrive.requested": {
    label: "Test drive requested",
    category: "testdrive",
    priority: "high",
    icon: "car",
    description: "A customer asks for a test drive.",
    alwaysOn: true,
  },
  "testdrive.tomorrow": {
    label: "Test drive tomorrow",
    category: "testdrive",
    priority: "medium",
    icon: "car",
    description: "Evening reminder to prepare the car and confirm with the customer.",
    scheduled: true,
  },
  "testdrive.today": {
    label: "Test drive today",
    category: "testdrive",
    priority: "high",
    icon: "car",
    description: "Morning reminder for today's test drives.",
    scheduled: true,
  },
  "testdrive.feedback_pending": {
    label: "Test drive feedback pending",
    category: "testdrive",
    priority: "medium",
    icon: "car",
    description: "A completed test drive with no feedback recorded.",
    scheduled: true,
  },
  "testdrive.cancelled": {
    label: "Test drive cancelled",
    category: "testdrive",
    priority: "medium",
    icon: "car",
    description: "A scheduled test drive was cancelled or marked a no-show.",
  },

  /* ---- Bookings & sales ---- */
  "booking.created": {
    label: "New booking",
    category: "booking",
    priority: "high",
    icon: "handshake",
    description: "A token is taken and a car is booked.",
  },
  "booking.payment_pending": {
    label: "Booking payment pending",
    category: "booking",
    priority: "high",
    icon: "handshake",
    description: "A booking is still not fully paid after several days.",
    scheduled: true,
  },
  "booking.expiring": {
    label: "Booking about to lapse",
    category: "booking",
    priority: "critical",
    icon: "alarm",
    description: "A booking has been open long enough to risk losing the sale.",
    scheduled: true,
    alwaysOn: true,
  },
  "booking.cancelled": {
    label: "Booking cancelled",
    category: "booking",
    priority: "high",
    icon: "handshake",
    description: "A booking was cancelled and the car is back in stock.",
  },
  "vehicle.sold": {
    label: "Car sold",
    category: "booking",
    priority: "medium",
    icon: "handshake",
    description: "A sale is recorded.",
  },

  /* ---- Inventory ---- */
  "vehicle.ageing": {
    label: "Car ageing in stock",
    category: "inventory",
    priority: "medium",
    icon: "trendingDown",
    description: "A car crosses 30 days unsold.",
    scheduled: true,
  },
  "vehicle.ageing_critical": {
    label: "Car ageing badly",
    category: "inventory",
    priority: "high",
    icon: "trendingDown",
    description: "A car crosses 60 and then 90 days unsold.",
    scheduled: true,
  },
  "vehicle.reserved": {
    label: "Car reserved",
    category: "inventory",
    priority: "medium",
    icon: "car",
    description: "A car is held for a customer.",
  },
  "vehicle.booked": {
    label: "Car booked",
    category: "inventory",
    priority: "medium",
    icon: "car",
    description: "A car moves to booked.",
  },
  "vehicle.price_changed": {
    label: "Price changed",
    category: "inventory",
    priority: "medium",
    icon: "tag",
    description: "Someone changes the asking price of a car in stock.",
  },
  "document.expiring": {
    label: "Insurance / RC expiring",
    category: "inventory",
    priority: "high",
    icon: "fileWarning",
    description: "Insurance, fitness or PUC expires within 30 days.",
    scheduled: true,
  },
  "document.expired": {
    label: "Insurance / RC expired",
    category: "inventory",
    priority: "critical",
    icon: "fileWarning",
    description: "A document on a car in stock has already expired.",
    scheduled: true,
    alwaysOn: true,
  },

  /* ---- Requirements ---- */
  "requirement.match": {
    label: "New car matches a customer brief",
    category: "requirement",
    priority: "high",
    icon: "target",
    description: "Stock you add answers a requirement a customer already gave you.",
  },

  /* ---- Staff & access ---- */
  "staff.added": {
    label: "Staff member added",
    category: "staff",
    priority: "medium",
    icon: "users",
    description: "A new user is given access to your dealership.",
  },
  "staff.removed": {
    label: "Staff access removed",
    category: "staff",
    priority: "high",
    icon: "shieldAlert",
    description: "A user is deactivated or removed.",
    alwaysOn: true,
  },
  "staff.role_changed": {
    label: "Role or permissions changed",
    category: "staff",
    priority: "high",
    icon: "shieldAlert",
    description: "Someone's role or permission set is edited.",
    alwaysOn: true,
  },

  /* ---- Sharing & system ---- */
  "catalog.shared": {
    label: "Catalog shared",
    category: "system",
    priority: "low",
    icon: "share",
    description: "A shortlist is shared with a customer.",
  },
  "system.plan_limit": {
    label: "Plan limit reached",
    category: "system",
    priority: "high",
    icon: "shieldAlert",
    description: "Your plan's vehicle, branch or staff limit is reached.",
    alwaysOn: true,
  },
  "system.notice": {
    label: "Platform notice",
    category: "system",
    priority: "medium",
    icon: "bell",
    description: "Announcements from CarVyapar.",
    alwaysOn: true,
  },

  /* ---- Super admin (platform staff only) ---- */
  "admin.dealer_signup": {
    label: "New dealership",
    category: "system",
    priority: "medium",
    icon: "building",
    description: "A new dealership joins the platform.",
  },
  "admin.subscription_expiring": {
    label: "Subscription expiring",
    category: "system",
    priority: "high",
    icon: "alarm",
    description: "A dealer's subscription ends within 7 days.",
    scheduled: true,
  },
  "admin.subscription_expired": {
    label: "Subscription expired",
    category: "system",
    priority: "critical",
    icon: "shieldAlert",
    description: "A dealer's subscription has lapsed.",
    scheduled: true,
    alwaysOn: true,
  },
} as const satisfies Record<string, NotificationTypeMeta>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

const FALLBACK: NotificationTypeMeta = {
  label: "Notification",
  category: "general",
  priority: "medium",
  icon: "bell",
  description: "",
};

/** Never throws — an unknown type from an older row still renders sensibly. */
export function typeMeta(type: string): NotificationTypeMeta {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeMeta>)[type] ?? FALLBACK;
}

export function isKnownType(type: string): type is NotificationType {
  return type in NOTIFICATION_TYPES;
}

/** Types a user is allowed to mute, grouped for the preferences screen. */
export function mutableTypesByCategory() {
  const groups = new Map<NotificationCategory, { type: string; meta: NotificationTypeMeta }[]>();
  for (const [type, meta] of Object.entries(NOTIFICATION_TYPES) as [string, NotificationTypeMeta][]) {
    if (meta.alwaysOn) continue;
    if (type.startsWith("admin.")) continue;
    const list = groups.get(meta.category) ?? [];
    list.push({ type, meta });
    groups.set(meta.category, list);
  }
  return groups;
}

/* ---------------------------- QUIET HOURS ---------------------------- */

/**
 * Quiet hours may wrap past midnight (e.g. 21 → 8). Critical alerts ignore them
 * entirely — a lapsing booking is worth a buzz at 11pm.
 */
export function isQuietHour(hour: number, start?: number | null, end?: number | null): boolean {
  if (start == null || end == null) return false;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export type DeliveryPreference = {
  inApp: boolean;
  browserPush: boolean;
  email: boolean;
  whatsapp: boolean;
  sound: boolean;
  mutedTypes: string[];
  minPriority: string;
  quietStart?: number | null;
  quietEnd?: number | null;
};

export const DEFAULT_PREFERENCE: DeliveryPreference = {
  inApp: true,
  browserPush: false,
  email: false,
  whatsapp: false,
  sound: true,
  mutedTypes: [],
  minPriority: "low",
  quietStart: null,
  quietEnd: null,
};

/**
 * Whether an in-app notification of this type should be written for a user.
 * Muting only ever suppresses optional types; `alwaysOn` types always land.
 */
export function shouldDeliver(
  type: string,
  priority: string,
  pref: DeliveryPreference,
): boolean {
  const meta = typeMeta(type);
  if (meta.alwaysOn) return true;
  if (pref.mutedTypes.includes(type)) return false;
  return meetsMinPriority(priority, pref.minPriority);
}

/* ------------------------------ FORMATTING ---------------------------- */

/** "in 25 min", "2 h overdue" — used in reminder bodies and the bell. */
export function dueLabel(due: Date, now = new Date()): string {
  const mins = Math.round((due.getTime() - now.getTime()) / 60000);
  const abs = Math.abs(mins);
  const unit =
    abs < 60
      ? `${abs} min`
      : abs < 1440
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / 1440)} d`;
  return mins >= 0 ? `in ${unit}` : `${unit} overdue`;
}

/**
 * Idempotency key builder. Same event on the same day produces the same key, so
 * a sweep that runs every 15 minutes creates one notification, not ninety-six.
 */
export function dedupe(parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(":");
}

/** Stable YYYY-MM-DD in the dealership's working timezone (IST). */
export function dayKey(date = new Date()): string {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}
