"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/server/events";
import { recordOutreach, moveLeadStage, autoAssignLead } from "@/server/leads";
import { attentionScope, getAttention } from "@/server/attention";
import { ACTION_META, snoozeUntil, FOLLOW_UP_OUTCOMES, type ActionKey } from "@/lib/attention";

/**
 * Actions for the "Needs your attention" centre.
 *
 * Two kinds live here: hiding an item, and finishing the work behind it without
 * leaving the page. Everything re-derives the dealer and the permissions from
 * the session — no id from the client is ever trusted as scope.
 */

/* ----------------------------- DISMISS / SNOOZE ----------------------- */

/**
 * Hides one action for this person.
 *
 * `stateHash` is stored so the dismissal lapses the moment the situation
 * changes — the count rising or the priority escalating brings it straight
 * back. Items marked `neverDismiss` are refused here, not just hidden in the
 * UI, so a crafted request cannot bury an expiring booking.
 */
export async function dismissAction(input: {
  actionId: string;
  actionKey: string;
  stateHash: string;
  snooze?: string | null;
}) {
  const user = await requireDealerUser();

  const meta = ACTION_META[input.actionKey as ActionKey];
  if (!meta) return { status: "error" as const, message: "Unknown action" };

  // A permanent dismissal is refused for the ones that cost real money; those
  // may only ever be snoozed for a short while.
  if (meta.neverDismiss && !input.snooze) {
    return {
      status: "error" as const,
      message: "This one cannot be hidden while it is still open. Snooze it instead.",
    };
  }

  const until = input.snooze ? snoozeUntil(input.snooze) : null;

  await db.actionDismissal.upsert({
    where: { userId_actionKey: { userId: user.id, actionKey: input.actionId } },
    create: {
      dealerId: user.dealerId,
      userId: user.id,
      actionKey: input.actionId,
      snoozedUntil: until,
      stateHash: input.stateHash,
    },
    update: { snoozedUntil: until, stateHash: input.stateHash, createdAt: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath("/attention");
  return {
    status: "success" as const,
    message: until ? "Snoozed" : "Hidden until something changes",
  };
}

/** Brings back everything this person has hidden. */
export async function restoreDismissedActions() {
  const user = await requireDealerUser();
  const result = await db.actionDismissal.deleteMany({ where: { userId: user.id } });
  revalidatePath("/dashboard");
  revalidatePath("/attention");
  return { status: "success" as const, count: result.count };
}

/**
 * Hides today's brief for this person.
 *
 * Reuses the dismissal table with a date-stamped key, so tomorrow's brief is a
 * different key and appears again on its own. No extra schema, and no risk of a
 * brief being suppressed permanently.
 */
export async function dismissBrief(dismissKey: string) {
  const user = await requireDealerUser();

  // Only ever accepts a brief key, so this cannot be used to bury an action.
  if (!/^brief:\d{4}-\d{2}-\d{2}$/.test(dismissKey)) {
    return { status: "error" as const, message: "Unknown brief" };
  }

  await db.actionDismissal.upsert({
    where: { userId_actionKey: { userId: user.id, actionKey: dismissKey } },
    create: { dealerId: user.dealerId, userId: user.id, actionKey: dismissKey },
    update: { createdAt: new Date() },
  });

  revalidatePath("/dashboard");
  return { status: "success" as const };
}

/* ------------------------------ QUICK FIXES --------------------------- */

/**
 * Logs that the customer was actually called or messaged.
 *
 * This is the action that makes an "uncontacted lead" disappear: it writes a
 * real activity and stamps the first-response time through the same path the
 * lead screen uses, so response-time reporting stays honest.
 */
export async function logQuickOutreach(input: {
  leadId: string;
  channel: "call" | "whatsapp";
  connected?: boolean;
  note?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const lead = await db.lead.findFirst({
    where: {
      id: input.leadId,
      dealerId: user.dealerId,
      ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
    },
    select: { id: true },
  });
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  await recordOutreach({
    dealerId: user.dealerId,
    leadId: lead.id,
    userId: user.id,
    channel: input.channel,
    title: input.channel === "call" ? "Called from the action centre" : "WhatsApp sent from the action centre",
    body: input.note,
    connected: input.connected ?? false,
  });

  revalidatePath("/dashboard");
  revalidatePath("/attention");
  revalidatePath(`/leads/${lead.id}`);
  return { status: "success" as const, message: "Logged" };
}

/**
 * Completes one follow-up from the work queue and optionally books the next
 * one, in a single round trip. This is the heart of "Save & next" — a
 * salesperson should touch the screen once per customer, not five times.
 */
export async function completeQueueTask(input: {
  followUpId?: string | null;
  leadId: string;
  outcome: string;
  note?: string;
  nextAt?: string | null;
  nextType?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const lead = await db.lead.findFirst({
    where: {
      id: input.leadId,
      dealerId: user.dealerId,
      ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
    },
    select: { id: true, reference: true, stage: true },
  });
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  const outcome = FOLLOW_UP_OUTCOMES.find((o) => o.value === input.outcome);
  if (!outcome) return { status: "error" as const, message: "Pick an outcome" };

  if (input.followUpId) {
    // Scoped by dealer as well as id, so another tenant's task cannot be closed.
    await db.followUp.updateMany({
      where: { id: input.followUpId, dealerId: user.dealerId, status: "pending" },
      data: {
        status: "done",
        completedAt: new Date(),
        outcome: `${outcome.label}${input.note ? ` — ${input.note}` : ""}`,
      },
    });
  }

  await db.leadActivity.create({
    data: {
      dealerId: user.dealerId,
      leadId: lead.id,
      userId: user.id,
      type: "call",
      title: outcome.label,
      body: input.note || null,
    },
  });

  // "No answer" is an attempt, not a conversation: it stamps the response time
  // but must not claim the customer was actually reached.
  await recordOutreach({
    dealerId: user.dealerId,
    leadId: lead.id,
    userId: user.id,
    channel: "call",
    title: `Follow-up: ${outcome.label}`,
    connected: outcome.value !== "no_answer",
  });

  if (outcome.stage && outcome.stage !== lead.stage) {
    await moveLeadStage({
      dealerId: user.dealerId,
      leadId: lead.id,
      stage: outcome.stage,
      userId: user.id,
      ...(outcome.value === "not_interested" ? { lostReason: "Not interested" } : {}),
    });
  }

  let scheduled = false;
  if (input.nextAt) {
    const dueAt = new Date(input.nextAt);
    if (!Number.isNaN(dueAt.getTime())) {
      await db.followUp.create({
        data: {
          dealerId: user.dealerId,
          leadId: lead.id,
          assignedToId: user.id,
          dueAt,
          type: input.nextType || "call",
          note: input.note || null,
        },
      });
      await db.lead.update({
        where: { id: lead.id },
        data: { nextFollowUpAt: dueAt, lastActivityAt: new Date() },
      });
      scheduled = true;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/attention");
  revalidatePath("/followups");
  revalidatePath(`/leads/${lead.id}`);

  return {
    status: "success" as const,
    message: scheduled ? "Saved and the next one is booked" : "Saved",
  };
}

/** Spreads every unowned lead across the sales team in one go. */
export async function autoAssignUnowned() {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_ASSIGN);

  const unowned = await db.lead.findMany({
    where: {
      dealerId: user.dealerId,
      ownerId: null,
      stage: { notIn: ["won", "lost", "not_interested"] },
      ...(user.branchIds.length
        ? { OR: [{ branchId: { in: user.branchIds } }, { branchId: null }] }
        : {}),
    },
    select: { id: true, branchId: true },
    take: 100,
  });

  let assigned = 0;
  for (const lead of unowned) {
    const owner = await autoAssignLead({
      dealerId: user.dealerId,
      leadId: lead.id,
      branchId: lead.branchId,
    });
    if (owner) assigned += 1;
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "assign",
    entity: "lead",
    summary: `Auto-assigned ${assigned} unowned lead(s) from the action centre`,
  });

  revalidatePath("/attention");
  revalidatePath("/leads");
  return {
    status: assigned ? ("success" as const) : ("error" as const),
    message: assigned
      ? `${assigned} lead${assigned === 1 ? "" : "s"} assigned`
      : "Nobody available to take them — check your sales team is active.",
  };
}

/**
 * Gives a booking more time. Extending moves the booking date forward, which is
 * what the expiry window is measured from, so the action updates rather than
 * silently disappearing.
 */
export async function extendBooking(bookingId: string, days = 7) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SALES_MANAGE);

  const booking = await db.booking.findFirst({
    where: { id: bookingId, dealerId: user.dealerId, status: "active" },
    select: { id: true, reference: true, bookedAt: true },
  });
  if (!booking) return { status: "error" as const, message: "Booking not found" };

  const extended = new Date(booking.bookedAt.getTime() + days * 86400000);
  await db.booking.update({ where: { id: booking.id }, data: { bookedAt: extended } });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "booking",
    entityId: booking.id,
    summary: `${booking.reference} extended by ${days} days`,
  });

  revalidatePath("/attention");
  revalidatePath("/sales");
  return { status: "success" as const, message: `Extended by ${days} days` };
}

/* ------------------------------- COUNTS ------------------------------- */

/** Live counts for the header badge, used by the client poller. */
export async function getAttentionCounts(branchId?: string | null) {
  const user = await requireDealerUser();
  const result = await getAttention(attentionScope(user, branchId));
  return { counts: result.counts, workCount: result.workCount };
}

/* ------------------------------ THRESHOLDS ---------------------------- */

export type ThresholdState = { status: "idle" | "success" | "error"; message?: string };

/**
 * The dealership's operating thresholds — how fast an enquiry must be answered,
 * how long a car may sit, when a booking is at risk.
 *
 * One row drives the action centre, the response queue and the scheduled
 * reminder engine alike, so a change here moves every alert together instead of
 * leaving three screens disagreeing about what "late" means.
 */
export async function saveAttentionThresholds(
  _prev: ThresholdState,
  formData: FormData,
): Promise<ThresholdState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const int = (name: string, min: number, max: number, fallback: number) => {
    const raw = Number(formData.get(name));
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.round(raw)));
  };

  const slaAttentionMinutes = int("slaAttentionMinutes", 1, 1440, 15);
  const slaHighMinutes = int("slaHighMinutes", 1, 1440, 30);
  const slaCriticalMinutes = int("slaCriticalMinutes", 1, 2880, 60);
  const slaEscalationMinutes = int("slaEscalationMinutes", 1, 10080, 180);

  // The ladder has to climb, or an enquiry could be "critical" before it is
  // merely "needs attention" and the alerts would fire out of order.
  if (
    !(slaAttentionMinutes < slaHighMinutes &&
      slaHighMinutes < slaCriticalMinutes &&
      slaCriticalMinutes < slaEscalationMinutes)
  ) {
    return {
      status: "error",
      message: "Each response step must be longer than the one before it.",
    };
  }

  const ageingWarnDays = int("ageingWarnDays", 7, 365, 60);
  const ageingCriticalDays = int("ageingCriticalDays", 8, 730, 90);
  if (ageingCriticalDays <= ageingWarnDays) {
    return { status: "error", message: "The critical ageing mark must be later than the first one." };
  }

  const leadWarmDays = int("leadWarmDays", 1, 90, 3);
  const leadColdDays = int("leadColdDays", 2, 180, 7);
  if (leadColdDays <= leadWarmDays) {
    return { status: "error", message: "A lead cannot go cold before it goes warm." };
  }

  const data = {
    slaAttentionMinutes,
    slaHighMinutes,
    slaCriticalMinutes,
    slaEscalationMinutes,
    ageingWarnDays,
    ageingCriticalDays,
    zeroEnquiryDays: int("zeroEnquiryDays", 1, 180, 14),
    leadWarmDays,
    leadColdDays,
    bookingExpiryDays: int("bookingExpiryDays", 1, 180, 14),
    testDriveSoonMinutes: int("testDriveSoonMinutes", 15, 1440, 120),
    stageStallDays: int("stageStallDays", 1, 90, 5),
  };

  await db.crmSettings.upsert({
    where: { dealerId: user.dealerId },
    create: { dealerId: user.dealerId, ...data },
    update: data,
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "dealer",
    entityId: user.dealerId,
    summary: "Updated the response, ageing and booking thresholds",
  });

  revalidatePath("/settings/thresholds");
  revalidatePath("/attention");
  revalidatePath("/dashboard");
  return { status: "success", message: "Thresholds saved — every alert follows them from now on." };
}
