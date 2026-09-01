/**
 * The action catalogue for the "Needs your attention" centre.
 *
 * Pure and client-safe. The distinction that matters, and that this whole
 * module exists to hold:
 *
 *   A notification says WHAT HAPPENED — "a new enquiry arrived".
 *   An action says WHAT IS STILL UNDONE — "that enquiry is 40 minutes old and
 *   nobody has replied".
 *
 * Notifications are events written to a table once. Actions are never stored:
 * they are computed from live business state every time the centre is opened,
 * which is why an action disappears the moment the work is actually done
 * rather than needing to be cleared by hand.
 */

import type { BadgeTone } from "@/lib/constants";

/* ------------------------------ PRIORITY ------------------------------ */

export const ACTION_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type ActionPriority = (typeof ACTION_PRIORITIES)[number];

export const ACTION_PRIORITY_META: Record<
  ActionPriority,
  { label: string; tone: BadgeTone; dot: string; rank: number; blurb: string }
> = {
  critical: {
    label: "Critical",
    tone: "danger",
    dot: "bg-danger-500",
    rank: 0,
    blurb: "A deal is actively being lost right now.",
  },
  high: {
    label: "High",
    tone: "warning",
    dot: "bg-warning-500",
    rank: 1,
    blurb: "Handle before the end of the day.",
  },
  medium: {
    label: "Medium",
    tone: "info",
    dot: "bg-brand-500",
    rank: 2,
    blurb: "Worth working through this week.",
  },
  low: {
    label: "Low",
    tone: "neutral",
    dot: "bg-ink-300",
    rank: 3,
    blurb: "Housekeeping that improves results over time.",
  },
};

export function actionRank(p: ActionPriority): number {
  return ACTION_PRIORITY_META[p].rank;
}

/* ------------------------------- GROUPS ------------------------------- */

/**
 * Every kind of unresolved work the centre can surface. The key is stable and
 * is what a dismissal is recorded against, so renaming one would un-dismiss it
 * for everybody — treat these as permanent.
 */
export const ACTION_KEYS = [
  // Leads
  "leads.uncontacted",
  "leads.unassigned",
  "leads.no_next_step",
  "leads.stalled",
  "leads.cold",
  // Follow-ups
  "followups.overdue",
  "followups.today",
  // Test drives
  "testdrives.soon",
  "testdrives.today",
  "testdrives.unconfirmed",
  "testdrives.no_show",
  "testdrives.feedback",
  // Bookings
  "bookings.expired",
  "bookings.expiring",
  "bookings.unpaid",
  // Requirements
  "requirements.matches",
  // Inventory
  "inventory.ageing",
  "inventory.zero_enquiry",
  "inventory.underperforming",
  "documents.expired",
  "documents.expiring",
  // Data quality
  "quality.no_photos",
  "quality.draft",
  "quality.missing_details",
  // Team
  "team.workload",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export type ActionCategory = "leads" | "followups" | "testdrives" | "bookings" | "inventory" | "team";

export const ACTION_CATEGORY_META: Record<ActionCategory, { label: string }> = {
  leads: { label: "Leads" },
  followups: { label: "Follow-ups" },
  testdrives: { label: "Test drives" },
  bookings: { label: "Bookings" },
  inventory: { label: "Inventory" },
  team: { label: "Team" },
};

/** Icon keys resolved to lucide components in the UI, so this file stays pure. */
export type ActionIcon =
  | "phoneMissed"
  | "userPlus"
  | "calendarClock"
  | "alarm"
  | "car"
  | "handshake"
  | "target"
  | "timer"
  | "eyeOff"
  | "fileWarning"
  | "imageOff"
  | "fileEdit"
  | "users"
  | "trendingDown";

export type ActionMeta = {
  label: string;
  category: ActionCategory;
  icon: ActionIcon;
  /** Base priority. The engine raises it when the situation is worse. */
  priority: ActionPriority;
  /** Weight in the sort score. Higher means it wins ties against other groups. */
  weight: number;
  /** Button label on the card. Always a real destination. */
  cta: string;
  /** Never permanently hideable — the money at stake is too direct. */
  neverDismiss?: boolean;
  /** Belongs in the Start My Day queue, worked one at a time. */
  queueable?: boolean;
};

export const ACTION_META: Record<ActionKey, ActionMeta> = {
  "leads.uncontacted": {
    label: "Uncontacted leads",
    category: "leads",
    icon: "phoneMissed",
    priority: "high",
    weight: 100,
    cta: "Call them",
    neverDismiss: true,
    queueable: true,
  },
  "leads.unassigned": {
    label: "Leads with no owner",
    category: "leads",
    icon: "userPlus",
    priority: "high",
    weight: 92,
    cta: "Assign",
    neverDismiss: true,
    queueable: true,
  },
  "leads.no_next_step": {
    label: "Active leads with no next step",
    category: "leads",
    icon: "calendarClock",
    priority: "high",
    weight: 84,
    cta: "Schedule follow-ups",
    queueable: true,
  },
  "leads.stalled": {
    label: "Leads stuck in one stage",
    category: "leads",
    icon: "timer",
    priority: "medium",
    weight: 55,
    cta: "Review",
  },
  "leads.cold": {
    label: "Leads gone cold",
    category: "leads",
    icon: "trendingDown",
    priority: "medium",
    weight: 50,
    cta: "Revive them",
  },

  "followups.overdue": {
    label: "Overdue follow-ups",
    category: "followups",
    icon: "alarm",
    priority: "high",
    weight: 98,
    cta: "Start follow-ups",
    neverDismiss: true,
    queueable: true,
  },
  "followups.today": {
    label: "Follow-ups due today",
    category: "followups",
    icon: "calendarClock",
    priority: "medium",
    weight: 70,
    cta: "View schedule",
    queueable: true,
  },

  "testdrives.soon": {
    label: "Test drive starting soon",
    category: "testdrives",
    icon: "car",
    priority: "critical",
    weight: 96,
    cta: "Get ready",
    neverDismiss: true,
    queueable: true,
  },
  "testdrives.today": {
    label: "Test drives today",
    category: "testdrives",
    icon: "car",
    priority: "high",
    weight: 76,
    cta: "View schedule",
    queueable: true,
  },
  "testdrives.unconfirmed": {
    label: "Test drives not confirmed",
    category: "testdrives",
    icon: "car",
    priority: "high",
    weight: 74,
    cta: "Confirm",
    queueable: true,
  },
  "testdrives.no_show": {
    label: "No-shows to chase",
    category: "testdrives",
    icon: "phoneMissed",
    priority: "medium",
    weight: 60,
    cta: "Follow up",
  },
  "testdrives.feedback": {
    label: "Test drives without feedback",
    category: "testdrives",
    icon: "fileEdit",
    priority: "medium",
    weight: 45,
    cta: "Record feedback",
  },

  "bookings.expired": {
    label: "Bookings past their date",
    category: "bookings",
    icon: "handshake",
    priority: "critical",
    weight: 99,
    cta: "Resolve",
    neverDismiss: true,
    queueable: true,
  },
  "bookings.expiring": {
    label: "Bookings expiring",
    category: "bookings",
    icon: "handshake",
    priority: "high",
    weight: 88,
    cta: "Review",
    neverDismiss: true,
    queueable: true,
  },
  "bookings.unpaid": {
    label: "Bookings with payment pending",
    category: "bookings",
    icon: "handshake",
    priority: "high",
    weight: 80,
    cta: "Chase payment",
  },

  "requirements.matches": {
    label: "Customers waiting for a car you now have",
    category: "leads",
    icon: "target",
    priority: "medium",
    weight: 68,
    cta: "View matches",
    queueable: true,
  },

  "inventory.ageing": {
    label: "Cars ageing in stock",
    category: "inventory",
    icon: "timer",
    priority: "medium",
    weight: 48,
    cta: "Review inventory",
  },
  "inventory.zero_enquiry": {
    label: "Cars with no enquiries",
    category: "inventory",
    icon: "eyeOff",
    priority: "medium",
    weight: 44,
    cta: "Review listings",
  },
  "inventory.underperforming": {
    label: "Listings underperforming",
    category: "inventory",
    icon: "trendingDown",
    priority: "low",
    weight: 30,
    cta: "See why",
  },
  "documents.expired": {
    label: "Expired vehicle documents",
    category: "inventory",
    icon: "fileWarning",
    priority: "critical",
    weight: 90,
    cta: "Renew",
    neverDismiss: true,
  },
  "documents.expiring": {
    label: "Documents expiring soon",
    category: "inventory",
    icon: "fileWarning",
    priority: "high",
    weight: 66,
    cta: "Renew",
  },

  "quality.no_photos": {
    label: "Live cars without photos",
    category: "inventory",
    icon: "imageOff",
    priority: "high",
    weight: 64,
    cta: "Add photos",
  },
  "quality.draft": {
    label: "Cars still in draft",
    category: "inventory",
    icon: "fileEdit",
    priority: "medium",
    weight: 42,
    cta: "Publish",
  },
  "quality.missing_details": {
    label: "Listings missing key details",
    category: "inventory",
    icon: "fileEdit",
    priority: "low",
    weight: 28,
    cta: "Complete them",
  },

  "team.workload": {
    label: "Someone is falling behind",
    category: "team",
    icon: "users",
    priority: "high",
    weight: 62,
    cta: "View workload",
  },
};

/* -------------------------------- ITEM -------------------------------- */

/** A quick action rendered as a button on the card or in the queue. */
export type ActionButton = {
  kind: "call" | "whatsapp" | "link" | "complete" | "assign" | "confirm" | "extend";
  label: string;
  href?: string;
  /** Payload for a server action, e.g. the follow-up id to complete. */
  id?: string;
  phone?: string;
  message?: string;
};

export type ActionItem = {
  key: ActionKey;
  /** Unique per item — the group key, plus an entity id for per-entity items. */
  id: string;
  priority: ActionPriority;
  score: number;
  count: number;
  /** Headline, already worded for a human: "3 leads nobody has answered". */
  title: string;
  /** The one fact that creates urgency: "oldest waiting 47 min". */
  detail: string | null;
  href: string;
  cta: string;
  /** Extra context lines shown when the card is expanded. */
  lines?: string[];
  /** Signature of how bad it is, so a dismissal lapses when it worsens. */
  stateHash: string;
  dismissible: boolean;
  branchName?: string | null;
};

export type AttentionResult = {
  items: ActionItem[];
  counts: { total: number; critical: number; high: number; medium: number; low: number };
  /** Total across every item, used for the dashboard badge. */
  workCount: number;
  generatedAt: string;
};

/* ------------------------------- SCORING ------------------------------ */

/**
 * Sorts the centre. Priority dominates; within a priority the group weight and
 * then how overdue things are decide the order.
 *
 * Deliberately never shown to a user — a dealer should see "3 leads waiting
 * 47 minutes", not "score 184.2".
 */
export function actionScore(input: {
  priority: ActionPriority;
  weight: number;
  count: number;
  /** Minutes past the point at which this became a problem. */
  overdueMinutes?: number;
  /** Rupee value at stake, if any. */
  value?: number;
}): number {
  const priorityBase = [10_000, 5_000, 2_000, 500][actionRank(input.priority)];
  const urgency = Math.min(400, Math.log1p(Math.max(0, input.overdueMinutes ?? 0)) * 45);
  const volume = Math.min(200, input.count * 12);
  const money = Math.min(300, Math.log1p(Math.max(0, input.value ?? 0) / 1000) * 30);
  return priorityBase + input.weight * 3 + urgency + volume + money;
}

/** Raises a base priority when the situation is worse than the default case. */
export function escalate(base: ActionPriority, steps: number): ActionPriority {
  const index = Math.max(0, actionRank(base) - steps);
  return ACTION_PRIORITIES[index];
}

/* ------------------------------ FORMATTING ---------------------------- */

/** "47 min", "2 days", "3 h" — the urgency phrase used all over the centre. */
export function waitLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) {
    const h = Math.round(m / 60);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(m / (60 * 24));
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** Plural helper that reads naturally in the card titles. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ----------------------------- SLA BANDING ---------------------------- */

export type SlaThresholds = {
  attention: number;
  high: number;
  critical: number;
  escalation: number;
};

export type AttentionSettings = SlaThresholds & {
  ageingWarnDays: number;
  ageingCriticalDays: number;
  zeroEnquiryDays: number;
  leadWarmDays: number;
  leadColdDays: number;
  bookingExpiryDays: number;
  testDriveSoonMinutes: number;
  stageStallDays: number;
};

export const DEFAULT_ATTENTION_SETTINGS: AttentionSettings = {
  attention: 15,
  high: 30,
  critical: 60,
  escalation: 180,
  ageingWarnDays: 60,
  ageingCriticalDays: 90,
  zeroEnquiryDays: 14,
  leadWarmDays: 3,
  leadColdDays: 7,
  bookingExpiryDays: 14,
  testDriveSoonMinutes: 120,
  stageStallDays: 5,
};

/**
 * Which band an unanswered enquiry falls into. Thresholds come from the
 * dealership's own settings, never from a constant in this file.
 */
export function slaBand(
  waitedMinutes: number,
  sla: SlaThresholds,
): { band: "normal" | "attention" | "high" | "critical"; priority: ActionPriority } {
  if (waitedMinutes >= sla.critical) return { band: "critical", priority: "critical" };
  if (waitedMinutes >= sla.high) return { band: "high", priority: "high" };
  if (waitedMinutes >= sla.attention) return { band: "attention", priority: "medium" };
  return { band: "normal", priority: "low" };
}

/** Lead freshness, used for the "gone cold" and "at risk" wording. */
export function leadTemperature(
  idleDays: number,
  settings: Pick<AttentionSettings, "leadWarmDays" | "leadColdDays">,
): "hot" | "warm" | "cold" {
  if (idleDays < settings.leadWarmDays) return "hot";
  if (idleDays < settings.leadColdDays) return "warm";
  return "cold";
}

/* --------------------------- FOLLOW-UP OUTCOMES ----------------------- */

/**
 * What a salesperson can say happened on a call, and the stage each answer
 * moves the lead to. Lives here rather than beside the server action because a
 * `"use server"` module may only export async functions — a plain array there
 * arrives on the client as an unusable proxy.
 */
export const FOLLOW_UP_OUTCOMES = [
  { value: "interested", label: "Interested", stage: "interested" },
  { value: "call_later", label: "Call later", stage: null },
  { value: "no_answer", label: "No answer", stage: null },
  { value: "test_drive", label: "Wants a test drive", stage: "test_drive_scheduled" },
  { value: "negotiation", label: "Negotiating", stage: "negotiation" },
  { value: "not_interested", label: "Not interested", stage: "not_interested" },
] as const;

export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number]["value"];

/* ---------------------------- SNOOZE OPTIONS -------------------------- */

export const SNOOZE_OPTIONS = [
  { value: "1h", label: "1 hour", hours: 1 },
  { value: "tomorrow", label: "Tomorrow morning", hours: null },
  { value: "3d", label: "3 days", hours: 72 },
] as const;

export type SnoozeValue = (typeof SNOOZE_OPTIONS)[number]["value"] | "custom";

/** Resolves a snooze choice to a moment. "Tomorrow" means 9am IST tomorrow. */
export function snoozeUntil(value: string, now = new Date()): Date {
  if (value === "tomorrow") {
    const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
    ist.setUTCDate(ist.getUTCDate() + 1);
    ist.setUTCHours(9, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 3600 * 1000);
  }
  const option = SNOOZE_OPTIONS.find((o) => o.value === value);
  const hours = option?.hours ?? 24;
  return new Date(now.getTime() + hours * 3600 * 1000);
}

/* ---------------------------- MORNING BRIEF --------------------------- */

export type BriefLine = {
  key: string;
  count: number;
  /** Already worded for a human: "7 overdue follow-ups". */
  label: string;
  href: string;
  priority: ActionPriority;
};

/**
 * The one-glance summary of the day.
 *
 * Built from the very same action items the cards below are built from, so the
 * brief can never claim a number the centre disagrees with. Groups that share a
 * theme are merged — a dealer thinks "two bookings need me", not "one expiring
 * and one lapsed".
 */
const BRIEF_GROUPS: {
  key: string;
  keys: ActionKey[];
  one: string;
  many: string;
  href: string;
}[] = [
  {
    key: "uncontacted",
    keys: ["leads.uncontacted", "leads.unassigned"],
    one: "enquiry waiting for a reply",
    many: "enquiries waiting for a reply",
    href: "/leads?bucket=uncontacted",
  },
  {
    key: "overdue",
    keys: ["followups.overdue"],
    one: "overdue follow-up",
    many: "overdue follow-ups",
    href: "/attention/day?queue=followups",
  },
  {
    key: "today",
    keys: ["followups.today"],
    one: "follow-up due later today",
    many: "follow-ups due later today",
    href: "/followups?bucket=today",
  },
  {
    key: "testdrives",
    keys: ["testdrives.soon", "testdrives.today", "testdrives.unconfirmed"],
    one: "test drive to run today",
    many: "test drives to run today",
    href: "/test-drives",
  },
  {
    key: "bookings",
    keys: ["bookings.expired", "bookings.expiring", "bookings.unpaid"],
    one: "booking needing attention",
    many: "bookings needing attention",
    href: "/sales?bucket=expiring",
  },
  {
    key: "matches",
    keys: ["requirements.matches"],
    one: "customer waiting for a car you now have",
    many: "customers waiting for a car you now have",
    href: "/requirements?status=matched",
  },
  {
    key: "ageing",
    keys: ["inventory.ageing"],
    one: "car sitting too long",
    many: "cars sitting too long",
    href: "/reports/ageing",
  },
  {
    key: "documents",
    keys: ["documents.expired", "documents.expiring"],
    one: "vehicle document to renew",
    many: "vehicle documents to renew",
    href: "/inventory?docs=expired",
  },
];

export function briefLines(items: ActionItem[]): BriefLine[] {
  const byKey = new Map(items.map((i) => [i.key as ActionKey, i]));

  return BRIEF_GROUPS.flatMap((group) => {
    const matched = group.keys.map((k) => byKey.get(k)).filter(Boolean) as ActionItem[];
    if (!matched.length) return [];

    const count = matched.reduce((sum, i) => sum + i.count, 0);
    if (!count) return [];

    // The most urgent member of the group sets the dot colour.
    const priority = matched
      .map((i) => i.priority)
      .sort((a, b) => actionRank(a) - actionRank(b))[0];

    return [{
      key: group.key,
      count,
      label: `${count} ${count === 1 ? group.one : group.many}`,
      href: group.href,
      priority,
    }];
  });
}

/** Key a dismissal against, so a brief is shown once per person per day. */
export function briefDismissKey(day: string): string {
  return `brief:${day}`;
}
