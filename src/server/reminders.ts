import "server-only";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { notify, notifyRecipients, notifySuperAdmins, purgeExpired } from "./notifications";
import { dedupe, dayKey, dueLabel } from "@/lib/notifications";
import { getAttentionSettings } from "./attention";
import type { AttentionSettings } from "@/lib/attention";
import { formatPrice, vehicleTitle, startOfDay, endOfDay, addDays } from "@/lib/utils";

/**
 * The scheduled reminder engine.
 *
 * Everything here runs on the server on a timer — never in a browser tab — so
 * reminders keep firing when nobody has the CRM open. Trigger it with:
 *
 *   POST /api/cron/reminders   (header: x-cron-secret: $CRON_SECRET)
 *   node scripts/run-reminders.mjs
 *
 * Every job is safe to run repeatedly. Each notification carries a `dedupeKey`
 * built from the entity plus the day (or the escalation step), so a sweep every
 * ten minutes produces one alert, not one hundred and forty-four.
 */

export const REMINDER_JOBS = [
  "followups",
  "sla",
  "leads",
  "testdrives",
  "ageing",
  "documents",
  "bookings",
  "digest",
  "platform",
  "retention",
] as const;

export type ReminderJob = (typeof REMINDER_JOBS)[number];

type JobContext = {
  dealerId: string;
  now: Date;
  /** IST hour of day, 0–23. Dealerships in India all work on one clock. */
  hour: number;
  today: string;
  /**
   * The dealership's own thresholds. Shared with the action centre, so an alert
   * and the card it corresponds to can never disagree about what counts as late.
   */
  settings: AttentionSettings;
};

type JobResult = { created: number; skipped: number };

const empty = (): JobResult => ({ created: 0, skipped: 0 });

function istHour(now: Date) {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).getUTCHours();
}

/* ------------------------------------------------------------------ */
/* FOLLOW-UPS                                                          */
/* ------------------------------------------------------------------ */

/**
 * Due today and overdue follow-ups. The reminder goes to the person the task is
 * assigned to; unassigned ones go to whoever can see all leads at that branch.
 */
async function jobFollowUps(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  const followUps = await db.followUp.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: "pending",
      dueAt: { lte: endOfDay(ctx.now) },
    },
    include: {
      lead: {
        select: {
          id: true,
          reference: true,
          branchId: true,
          customer: { select: { name: true, phone: true } },
        },
      },
    },
    take: 500,
  });

  for (const f of followUps) {
    const overdue = f.dueAt < ctx.now;
    const type = overdue ? "followup.overdue" : "followup.due";

    // Overdue items escalate the longer they sit, so the key includes the day:
    // one nudge per day per task, and the wording gets sharper each time.
    const key = dedupe([type, f.id, ctx.today]);

    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        permissions: [PERMISSIONS.LEADS_VIEW_ALL],
        branchId: f.lead.branchId,
        includeUserIds: [f.assignedToId],
        // When the task has an owner, only that person is nudged.
        ...(f.assignedToId ? { permissions: undefined } : {}),
      },
      {
        type,
        title: overdue
          ? `Overdue: ${f.type.replace(/_/g, " ")} ${f.lead.customer.name}`
          : `Due today: ${f.type.replace(/_/g, " ")} ${f.lead.customer.name}`,
        body: `${f.lead.reference} · ${dueLabel(f.dueAt, ctx.now)}${f.note ? ` · ${f.note}` : ""}`,
        link: `/leads/${f.lead.id}`,
        priority: overdue ? "critical" : "high",
        entityType: "followup",
        entityId: f.id,
        dedupeKey: key,
        meta: {
          phone: f.lead.customer.phone,
          customerName: f.lead.customer.name,
          followUpId: f.id,
          dueAt: f.dueAt.toISOString(),
        },
      },
    );

    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* RESPONSE TIME (SLA)                                                 */
/* ------------------------------------------------------------------ */

/**
 * The escalation ladder, built from the dealership's configured response
 * promise rather than from constants — a dealer who promises 15 minutes gets
 * alerts on their own timetable.
 */
function slaSteps(settings: AttentionSettings) {
  const label = (minutes: number) =>
    minutes < 60
      ? `${minutes} minutes`
      : `${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}`;

  return [
    { minutes: settings.high, type: "lead.sla_warning", label: label(settings.high) },
    { minutes: settings.critical, type: "lead.sla_breach", label: label(settings.critical) },
    { minutes: settings.escalation, type: "lead.sla_escalation", label: label(settings.escalation) },
  ] as const;
}

/**
 * Enquiries nobody has answered yet. Escalates from the owner, to managers, to
 * the dealership owner. Only ever fires once per lead per step.
 */
async function jobSla(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  const waiting = await db.lead.findMany({
    where: {
      dealerId: ctx.dealerId,
      firstResponseAt: null,
      stage: { notIn: ["won", "lost", "not_interested"] },
      createdAt: { gte: addDays(ctx.now, -7) }, // older than a week is a dead lead, not an SLA
    },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      branchId: true,
      ownerId: true,
      customer: { select: { name: true, phone: true } },
    },
    take: 300,
  });

  for (const lead of waiting) {
    const waited = Math.floor((ctx.now.getTime() - lead.createdAt.getTime()) / 60000);

    // Only the highest step reached fires, so a lead found at 4 hours old gets
    // the escalation, not all three notifications at once.
    const step = [...slaSteps(ctx.settings)].reverse().find((s) => waited >= s.minutes);
    if (!step) continue;

    const audience =
      step.type === "lead.sla_warning"
        ? { permissions: undefined, includeUserIds: [lead.ownerId] }
        : step.type === "lead.sla_breach"
          ? { permissions: [PERMISSIONS.LEADS_ASSIGN], includeUserIds: [lead.ownerId] }
          : { permissions: [PERMISSIONS.LEADS_ASSIGN, PERMISSIONS.REPORTS_VIEW], includeUserIds: [lead.ownerId] };

    // An unowned lead has nobody to warn, so the warning step goes to managers.
    if (step.type === "lead.sla_warning" && !lead.ownerId) {
      audience.permissions = [PERMISSIONS.LEADS_ASSIGN];
    }

    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        branchId: lead.branchId,
        ...audience,
      },
      {
        type: step.type,
        title:
          step.type === "lead.sla_escalation"
            ? `Escalated: ${lead.customer.name} has waited ${step.label}`
            : `${lead.customer.name} has waited ${step.label} for a reply`,
        body: `${lead.reference} · still no first response${lead.ownerId ? "" : " · nobody owns this lead"}`,
        link: `/leads/${lead.id}`,
        priority: step.type === "lead.sla_warning" ? "high" : "critical",
        entityType: "lead",
        entityId: lead.id,
        // One per lead per step, forever — not per day.
        dedupeKey: dedupe([step.type, lead.id]),
        meta: {
          phone: lead.customer.phone,
          customerName: lead.customer.name,
          waitedMinutes: waited,
        },
      },
    );

    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* UNOWNED AND STALE LEADS                                             */
/* ------------------------------------------------------------------ */

async function jobLeads(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  // Nobody has picked this up after two hours.
  const unowned = await db.lead.findMany({
    where: {
      dealerId: ctx.dealerId,
      ownerId: null,
      stage: { notIn: ["won", "lost", "not_interested"] },
      createdAt: { lte: new Date(ctx.now.getTime() - 2 * 3600 * 1000) },
    },
    select: { id: true, reference: true, branchId: true, customer: { select: { name: true } } },
    take: 100,
  });

  for (const lead of unowned) {
    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        permissions: [PERMISSIONS.LEADS_ASSIGN],
        branchId: lead.branchId,
      },
      {
        type: "lead.unassigned",
        title: `${lead.customer.name}'s enquiry still has no owner`,
        body: `${lead.reference} · assign it so someone is accountable`,
        link: `/leads/${lead.id}`,
        entityType: "lead",
        entityId: lead.id,
        dedupeKey: dedupe(["lead.unassigned", lead.id, ctx.today]),
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  // Open leads that have gone quiet for a week.
  const stale = await db.lead.findMany({
    where: {
      dealerId: ctx.dealerId,
      stage: { notIn: ["won", "lost", "not_interested"] },
      lastActivityAt: { lte: addDays(ctx.now, -ctx.settings.leadColdDays) },
      ownerId: { not: null },
    },
    select: {
      id: true,
      reference: true,
      branchId: true,
      ownerId: true,
      lastActivityAt: true,
      customer: { select: { name: true, phone: true } },
    },
    take: 200,
  });

  for (const lead of stale) {
    const days = Math.floor((ctx.now.getTime() - lead.lastActivityAt.getTime()) / 86400000);
    const created = await notifyRecipients(
      { dealerId: ctx.dealerId, branchId: lead.branchId, includeUserIds: [lead.ownerId] },
      {
        type: "lead.stale",
        title: `${lead.customer.name} has heard nothing for ${days} days`,
        body: `${lead.reference} · close it or make contact`,
        link: `/leads/${lead.id}`,
        entityType: "lead",
        entityId: lead.id,
        // Weekly, not daily — a nag every morning gets ignored.
        dedupeKey: dedupe(["lead.stale", lead.id, String(Math.floor(days / 7))]),
        meta: { phone: lead.customer.phone, customerName: lead.customer.name },
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* TEST DRIVES                                                         */
/* ------------------------------------------------------------------ */

async function jobTestDrives(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  const upcoming = await db.testDrive.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: { in: ["requested", "confirmed"] },
      scheduledAt: { gte: startOfDay(ctx.now), lte: endOfDay(addDays(ctx.now, 1)) },
    },
    include: {
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { make: true, model: true, year: true, variant: true, stockId: true } },
    },
    take: 200,
  });

  const todayEnd = endOfDay(ctx.now).getTime();

  for (const td of upcoming) {
    const isToday = td.scheduledAt.getTime() <= todayEnd;

    // Morning briefing for today; evening heads-up for tomorrow.
    if (isToday && ctx.hour < 6) continue;
    if (!isToday && ctx.hour < 17) continue;

    const type = isToday ? "testdrive.today" : "testdrive.tomorrow";
    const when = td.scheduledAt.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        branchId: td.branchId,
        includeUserIds: [td.assignedToId],
        ...(td.assignedToId ? {} : { permissions: [PERMISSIONS.LEADS_VIEW_ALL] }),
      },
      {
        type,
        title: isToday
          ? `Test drive today: ${td.customer.name}`
          : `Test drive tomorrow: ${td.customer.name}`,
        body: `${when}${td.vehicle ? ` · ${vehicleTitle(td.vehicle)} (${td.vehicle.stockId})` : ""}`,
        link: "/test-drives",
        entityType: "testdrive",
        entityId: td.id,
        dedupeKey: dedupe([type, td.id, ctx.today]),
        meta: { phone: td.customer.phone, customerName: td.customer.name },
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  // A drive happened but nobody wrote down what the customer thought.
  const noFeedback = await db.testDrive.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: "completed",
      feedback: null,
      scheduledAt: { gte: addDays(ctx.now, -7), lte: addDays(ctx.now, -1) },
    },
    select: {
      id: true,
      branchId: true,
      assignedToId: true,
      scheduledAt: true,
      customer: { select: { name: true } },
    },
    take: 100,
  });

  for (const td of noFeedback) {
    const created = await notifyRecipients(
      { dealerId: ctx.dealerId, branchId: td.branchId, includeUserIds: [td.assignedToId] },
      {
        type: "testdrive.feedback_pending",
        title: `Record what ${td.customer.name} thought of the drive`,
        body: "Feedback is the strongest signal of whether this deal is alive.",
        link: "/test-drives",
        entityType: "testdrive",
        entityId: td.id,
        dedupeKey: dedupe(["testdrive.feedback_pending", td.id]),
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* INVENTORY AGEING                                                    */
/* ------------------------------------------------------------------ */

/** Built from the dealership's own ageing thresholds, plus an early nudge. */
function ageingSteps(settings: AttentionSettings) {
  const early = Math.max(15, Math.round(settings.ageingWarnDays / 2));
  return [
    { days: early, type: "vehicle.ageing", priority: "medium" as const, note: "Consider a price review or a fresh photo set." },
    { days: settings.ageingWarnDays, type: "vehicle.ageing_critical", priority: "high" as const, note: "Holding cost is adding up. Time to act on the price." },
    { days: settings.ageingCriticalDays, type: "vehicle.ageing_critical", priority: "critical" as const, note: "This car is costing you money every week it stays." },
  ];
}

async function jobAgeing(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  // Ageing is a once-a-day message, not something to repeat all afternoon.
  if (ctx.hour < 8 || ctx.hour > 11) return result;

  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: { in: ["available", "reserved"] },
      listedAt: { not: null, lte: addDays(ctx.now, -Math.max(15, Math.round(ctx.settings.ageingWarnDays / 2))) },
    },
    select: {
      id: true,
      stockId: true,
      make: true,
      model: true,
      year: true,
      variant: true,
      branchId: true,
      listedAt: true,
      sellingPrice: true,
    },
    take: 500,
  });

  for (const v of vehicles) {
    const days = Math.floor((ctx.now.getTime() - v.listedAt!.getTime()) / 86400000);
    const step = [...ageingSteps(ctx.settings)].reverse().find((s) => days >= s.days);
    if (!step) continue;

    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        permissions: [PERMISSIONS.INVENTORY_EDIT],
        branchId: v.branchId,
      },
      {
        type: step.type,
        title: `${v.stockId} has been in stock ${days} days`,
        body: `${vehicleTitle(v)} at ${formatPrice(v.sellingPrice)}. ${step.note}`,
        link: `/inventory/${v.id}`,
        priority: step.priority,
        entityType: "vehicle",
        entityId: v.id,
        // One alert per car per threshold, not per day.
        dedupeKey: dedupe(["vehicle.ageing", v.id, String(step.days)]),
        meta: { days, stockId: v.stockId },
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* DOCUMENT EXPIRY                                                     */
/* ------------------------------------------------------------------ */

const DOCUMENTS = [
  { field: "insuranceValidTill", label: "Insurance" },
  { field: "fitnessValidTill", label: "Fitness certificate" },
  { field: "pucValidTill", label: "PUC" },
] as const;

async function jobDocuments(ctx: JobContext): Promise<JobResult> {
  const result = empty();
  if (ctx.hour < 8 || ctx.hour > 11) return result;

  const horizon = addDays(ctx.now, 30);

  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: { in: ["available", "reserved", "booked"] },
      OR: DOCUMENTS.map((d) => ({ [d.field]: { not: null, lte: horizon } })),
    },
    select: {
      id: true,
      stockId: true,
      make: true,
      model: true,
      year: true,
      variant: true,
      branchId: true,
      insuranceValidTill: true,
      fitnessValidTill: true,
      pucValidTill: true,
    },
    take: 500,
  });

  for (const v of vehicles) {
    for (const doc of DOCUMENTS) {
      const till = v[doc.field];
      if (!till || till > horizon) continue;

      const expired = till < ctx.now;
      const days = Math.abs(Math.ceil((till.getTime() - ctx.now.getTime()) / 86400000));

      const created = await notifyRecipients(
        {
          dealerId: ctx.dealerId,
          permissions: [PERMISSIONS.INVENTORY_EDIT],
          branchId: v.branchId,
        },
        {
          type: expired ? "document.expired" : "document.expiring",
          title: expired
            ? `${doc.label} expired on ${v.stockId}`
            : `${doc.label} on ${v.stockId} expires in ${days} day${days === 1 ? "" : "s"}`,
          body: `${vehicleTitle(v)} · ${expired ? `${days} day${days === 1 ? "" : "s"} ago. A buyer cannot register this car.` : "Renew before it blocks a sale."}`,
          link: `/inventory/${v.id}/edit`,
          entityType: "vehicle",
          entityId: v.id,
          // Weekly while expiring, daily once actually expired.
          dedupeKey: dedupe([
            expired ? "document.expired" : "document.expiring",
            v.id,
            doc.field,
            expired ? ctx.today : String(Math.floor(days / 7)),
          ]),
          meta: { document: doc.label, validTill: till.toISOString() },
        },
      );
      result.created += created;
      if (!created) result.skipped += 1;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* BOOKINGS                                                            */
/* ------------------------------------------------------------------ */

async function jobBookings(ctx: JobContext): Promise<JobResult> {
  const result = empty();
  if (ctx.hour < 8 || ctx.hour > 11) return result;

  const bookings = await db.booking.findMany({
    where: {
      dealerId: ctx.dealerId,
      status: "active",
      bookedAt: { lte: addDays(ctx.now, -3) },
    },
    include: {
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { stockId: true, make: true, model: true, year: true, variant: true } },
    },
    take: 200,
  });

  for (const b of bookings) {
    const days = Math.floor((ctx.now.getTime() - b.bookedAt.getTime()) / 86400000);
    const lapsing = days >= ctx.settings.bookingExpiryDays;
    const unpaid = b.paymentStatus !== "paid";

    if (!lapsing && !unpaid) continue;

    const type = lapsing ? "booking.expiring" : "booking.payment_pending";
    const created = await notifyRecipients(
      {
        dealerId: ctx.dealerId,
        permissions: [PERMISSIONS.SALES_MANAGE],
        branchId: b.branchId,
        includeUserIds: [b.salesExecutiveId],
      },
      {
        type,
        title: lapsing
          ? `${b.reference} has been open ${days} days`
          : `Payment still pending on ${b.reference}`,
        body: `${b.customer.name} · ${vehicleTitle(b.vehicle)} · ${formatPrice(b.bookingAmount)} of ${formatPrice(b.agreedPrice)} received`,
        link: "/sales",
        entityType: "booking",
        entityId: b.id,
        dedupeKey: dedupe([type, b.id, String(Math.floor(days / 7))]),
        meta: { phone: b.customer.phone, customerName: b.customer.name, days },
      },
    );
    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* DAILY DIGEST                                                        */
/* ------------------------------------------------------------------ */

/**
 * One morning summary per person: what is due today and what is already late.
 * Sent only to people who actually have something to do, so it never becomes
 * noise that gets swiped away unread.
 */
async function jobDigest(ctx: JobContext): Promise<JobResult> {
  const result = empty();

  const staff = await db.user.findMany({
    where: { dealerId: ctx.dealerId, isActive: true },
    select: {
      id: true,
      notificationPreference: { select: { digestEnabled: true, digestHour: true } },
    },
  });

  const dayStart = startOfDay(ctx.now);
  const dayEnd = endOfDay(ctx.now);

  for (const person of staff) {
    const pref = person.notificationPreference;
    if (pref && !pref.digestEnabled) continue;
    if (ctx.hour !== (pref?.digestHour ?? 9)) continue;

    const [dueToday, overdue, testDrives] = await Promise.all([
      db.followUp.count({
        where: {
          dealerId: ctx.dealerId,
          assignedToId: person.id,
          status: "pending",
          dueAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      db.followUp.count({
        where: {
          dealerId: ctx.dealerId,
          assignedToId: person.id,
          status: "pending",
          dueAt: { lt: dayStart },
        },
      }),
      db.testDrive.count({
        where: {
          dealerId: ctx.dealerId,
          assignedToId: person.id,
          status: { in: ["requested", "confirmed"] },
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ]);

    if (dueToday + overdue + testDrives === 0) {
      result.skipped += 1;
      continue;
    }

    const parts = [
      dueToday ? `${dueToday} follow-up${dueToday === 1 ? "" : "s"} due` : null,
      overdue ? `${overdue} overdue` : null,
      testDrives ? `${testDrives} test drive${testDrives === 1 ? "" : "s"}` : null,
    ].filter(Boolean);

    const created = await notify({
      dealerId: ctx.dealerId,
      userId: person.id,
      type: "followup.summary",
      title: `Your day: ${parts.join(", ")}`,
      body: overdue
        ? "Clear the overdue ones first — they are the deals most likely to slip."
        : "Open the follow-up board to work through them.",
      link: "/followups",
      priority: overdue ? "high" : "medium",
      dedupeKey: dedupe(["followup.summary", person.id, ctx.today]),
      // A day plan is worthless tomorrow.
      expiresAt: endOfDay(ctx.now),
    });

    if (created) result.created += 1;
    else result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* PLATFORM (SUPER ADMIN)                                              */
/* ------------------------------------------------------------------ */

/**
 * Subscription health, for platform staff only.
 *
 * Deliberately carries nothing private: the dealership name, the plan and the
 * date. No lead counts, no revenue, no customer details ever cross the tenant
 * boundary into a platform notification.
 */
async function jobPlatform(now: Date, today: string, hour: number): Promise<JobResult> {
  const result = empty();
  if (hour < 8 || hour > 11) return result;

  const soon = addDays(now, 7);

  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["trial", "active"] },
      OR: [
        { currentPeriodEnd: { not: null, lte: soon } },
        { trialEndsAt: { not: null, lte: soon } },
      ],
    },
    include: {
      dealer: { select: { id: true, name: true } },
      plan: { select: { name: true } },
    },
    take: 300,
  });

  for (const sub of subscriptions) {
    const ends = sub.currentPeriodEnd ?? sub.trialEndsAt;
    if (!ends) continue;

    const expired = ends < now;
    const days = Math.abs(Math.ceil((ends.getTime() - now.getTime()) / 86400000));

    const created = await notifySuperAdmins({
      dealerId: sub.dealer.id,
      type: expired ? "admin.subscription_expired" : "admin.subscription_expiring",
      title: expired
        ? `${sub.dealer.name}'s subscription has lapsed`
        : `${sub.dealer.name} renews in ${days} day${days === 1 ? "" : "s"}`,
      body: `${sub.plan.name} · ${sub.status === "trial" ? "trial" : sub.billingCycle}`,
      link: `/admin/dealers/${sub.dealer.id}`,
      entityType: "dealer",
      entityId: sub.dealer.id,
      dedupeKey: dedupe([
        expired ? "admin.subscription_expired" : "admin.subscription_expiring",
        sub.id,
        expired ? today : String(days),
      ]),
    });

    result.created += created;
    if (!created) result.skipped += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* RUNNER                                                              */
/* ------------------------------------------------------------------ */

const JOBS: Record<
  Exclude<ReminderJob, "retention" | "platform">,
  (ctx: JobContext) => Promise<JobResult>
> = {
  followups: jobFollowUps,
  sla: jobSla,
  leads: jobLeads,
  testdrives: jobTestDrives,
  ageing: jobAgeing,
  documents: jobDocuments,
  bookings: jobBookings,
  digest: jobDigest,
};

export type SweepReport = {
  startedAt: string;
  finishedAt: string;
  dealers: number;
  jobs: { job: string; dealerId?: string; created: number; skipped: number; error?: string }[];
  purged: number;
};

/**
 * Runs every job for every active dealer. Safe to call as often as you like —
 * ten minutes is a good interval.
 */
export async function runReminderSweep(options?: {
  dealerId?: string;
  jobs?: ReminderJob[];
  now?: Date;
}): Promise<SweepReport> {
  const now = options?.now ?? new Date();
  const startedAt = now.toISOString();
  const wanted = options?.jobs ?? [...REMINDER_JOBS];
  const report: SweepReport["jobs"] = [];

  // Suspended and expired dealerships stop receiving reminders.
  const dealers = await db.dealer.findMany({
    where: {
      status: { in: ["trial", "active"] },
      ...(options?.dealerId ? { id: options.dealerId } : {}),
    },
    select: { id: true },
  });

  for (const dealer of dealers) {
    const ctx: JobContext = {
      dealerId: dealer.id,
      now,
      hour: istHour(now),
      today: dayKey(now),
      settings: await getAttentionSettings(dealer.id),
    };

    for (const job of wanted) {
      if (job === "retention" || job === "platform") continue;
      const fn = JOBS[job];
      if (!fn) continue;

      const runKey = `${job}:${dealer.id}:${ctx.today}:${Math.floor(now.getMinutes() / 10)}`;
      const run = await db.reminderRun.create({
        data: { dealerId: dealer.id, job, runKey: `${runKey}:${now.getTime()}` },
      });

      try {
        const res = await fn(ctx);
        await db.reminderRun.update({
          where: { id: run.id },
          data: { finishedAt: new Date(), created: res.created, skipped: res.skipped },
        });
        report.push({ job, dealerId: dealer.id, ...res });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db.reminderRun.update({
          where: { id: run.id },
          data: { finishedAt: new Date(), error: message },
        });
        // One failing job must not stop the rest of the sweep.
        report.push({ job, dealerId: dealer.id, created: 0, skipped: 0, error: message });
      }
    }
  }

  // Platform notices are not per-dealer, so they run once for the whole sweep.
  if (wanted.includes("platform") && !options?.dealerId) {
    try {
      const res = await jobPlatform(now, dayKey(now), istHour(now));
      report.push({ job: "platform", ...res });
    } catch (error) {
      report.push({
        job: "platform",
        created: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let purged = 0;
  if (wanted.includes("retention")) {
    purged = await purgeExpired();
    await db.reminderRun.deleteMany({
      where: { startedAt: { lt: addDays(now, -14) } },
    });
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dealers: dealers.length,
    jobs: report,
    purged,
  };
}

/**
 * Opportunistic fallback for environments without a cron scheduler (local
 * development, a single small VPS). The polling endpoint calls this; it does
 * real work at most once every `SWEEP_INTERVAL_MS`, and every notification it
 * writes is deduped exactly like a cron-driven one.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastOpportunisticSweep = 0;
let inFlight: Promise<unknown> | null = null;

export async function maybeSweep(now = new Date()) {
  if (process.env.DISABLE_REMINDER_FALLBACK === "1") return false;
  if (inFlight) return false;
  if (now.getTime() - lastOpportunisticSweep < SWEEP_INTERVAL_MS) return false;

  lastOpportunisticSweep = now.getTime();
  inFlight = runReminderSweep({ now })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });

  return true;
}
