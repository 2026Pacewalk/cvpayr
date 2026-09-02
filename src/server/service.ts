import "server-only";
import { db } from "@/lib/db";
import { sendDealerSms } from "./sms";
import { notifyRecipients } from "./notifications";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * Workshop job cards.
 *
 * The one rule worth stating: closing a visit is what sends the customer their
 * feedback SMS, and it sends exactly once. `feedbackSmsAt` is stamped only when
 * the gateway accepts the message, so a visit reopened and closed again does not
 * message the same customer twice, and a failed send can be retried without
 * having been silently marked as done.
 */

export const SERVICE_STATUSES = [
  { value: "open", label: "Open", tone: "info" as const, help: "Booked in, work not started" },
  { value: "in_progress", label: "In progress", tone: "warning" as const, help: "On the ramp" },
  { value: "ready", label: "Ready", tone: "purple" as const, help: "Done, waiting for collection" },
  { value: "closed", label: "Closed", tone: "success" as const, help: "Handed over and invoiced" },
  { value: "cancelled", label: "Cancelled", tone: "neutral" as const, help: "Did not go ahead" },
];

export const SERVICE_TYPES = [
  { value: "periodic", label: "Periodic service" },
  { value: "repair", label: "Repair" },
  { value: "bodyshop", label: "Bodyshop" },
  { value: "warranty", label: "Warranty" },
  { value: "accessories", label: "Accessories / fitment" },
  { value: "other", label: "Other" },
];

export const OPEN_SERVICE_STATUSES = ["open", "in_progress", "ready"];

/** The template a closed visit sends. Matches the key seeded in src/lib/sms.ts. */
export const FEEDBACK_TEMPLATE_KEY = "service_thank_you";

export type ServiceScope = {
  dealerId: string;
  branchIds: string[];
};

export function serviceWhere(scope: ServiceScope, extra: Record<string, unknown> = {}) {
  return {
    dealerId: scope.dealerId,
    ...(scope.branchIds.length
      ? { OR: [{ branchId: { in: scope.branchIds } }, { branchId: null }] }
      : {}),
    ...extra,
  };
}

export const serviceListSelect = {
  id: true,
  jobCardNumber: true,
  status: true,
  serviceType: true,
  registrationNumber: true,
  make: true,
  model: true,
  complaint: true,
  amount: true,
  openedAt: true,
  promisedAt: true,
  closedAt: true,
  feedbackSmsAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  branch: { select: { name: true } },
  assignedTo: { select: { name: true } },
} as const;

export async function getServiceCounts(scope: ServiceScope) {
  const [open, inProgress, ready, closedToday, all] = await Promise.all([
    db.serviceVisit.count({ where: serviceWhere(scope, { status: "open" }) }),
    db.serviceVisit.count({ where: serviceWhere(scope, { status: "in_progress" }) }),
    db.serviceVisit.count({ where: serviceWhere(scope, { status: "ready" }) }),
    db.serviceVisit.count({
      where: serviceWhere(scope, {
        status: "closed",
        closedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    }),
    db.serviceVisit.count({ where: serviceWhere(scope) }),
  ]);
  return { open, inProgress, ready, closedToday, all };
}

/**
 * Generates the next job card number for a dealership, in the same style as the
 * lead and sale references so a customer sees one numbering scheme.
 */
export async function nextJobCardNumber(dealerId: string): Promise<string> {
  const last = await db.serviceVisit.findFirst({
    where: { dealerId, jobCardNumber: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { jobCardNumber: true },
  });
  const n = Number(last?.jobCardNumber?.replace(/\D/g, "") ?? 0) + 1;
  return `JC-${String(n).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* CLOSING A VISIT                                                     */
/* ------------------------------------------------------------------ */

export type CloseResult = {
  status: "success" | "error";
  message: string;
  /** What happened to the feedback SMS, reported honestly. */
  sms: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
  };
};

/**
 * Closes a visit and sends the feedback SMS.
 *
 * The visit closes whatever the SMS does. A gateway outage must not block a
 * service advisor from handing a car back, so the message is reported
 * separately rather than failing the whole action — and never claimed as sent
 * when it was not.
 */
export async function closeServiceVisit(input: {
  dealerId: string;
  userId: string;
  visitId: string;
  workDone?: string | null;
  amount?: number | null;
  sendFeedbackSms?: boolean;
}): Promise<CloseResult> {
  const visit = await db.serviceVisit.findFirst({
    where: { id: input.visitId, dealerId: input.dealerId },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  if (!visit) return { status: "error", message: "Visit not found", sms: { attempted: false, sent: false } };

  const alreadyMessaged = Boolean(visit.feedbackSmsAt);

  await db.serviceVisit.update({
    where: { id: visit.id },
    data: {
      status: "closed",
      closedAt: visit.closedAt ?? new Date(),
      ...(input.workDone !== undefined ? { workDone: input.workDone } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
    },
  });

  // Tell the branch a car went out, using the existing notification pipeline
  // rather than inventing a second one.
  await notifyRecipients(
    {
      dealerId: input.dealerId,
      permissions: [PERMISSIONS.SERVICE_VIEW],
      branchId: visit.branchId,
      excludeUserIds: [input.userId],
    },
    {
      type: "system.notice",
      title: `${visit.customer.name}'s car has been handed back`,
      body: [visit.jobCardNumber, visit.registrationNumber].filter(Boolean).join(" · ") || undefined,
      link: `/service/${visit.id}`,
      priority: "low",
      actorId: input.userId,
      entityType: "service",
      entityId: visit.id,
    },
  );

  if (input.sendFeedbackSms === false) {
    return {
      status: "success",
      message: "Visit closed. No SMS sent.",
      sms: { attempted: false, sent: false, reason: "Skipped by the advisor" },
    };
  }

  if (alreadyMessaged) {
    return {
      status: "success",
      message: "Visit closed. The customer was already sent the feedback SMS.",
      sms: { attempted: false, sent: false, reason: "Already sent once" },
    };
  }

  const dealer = await db.dealer.findUnique({
    where: { id: input.dealerId },
    select: { name: true },
  });

  const result = await sendDealerSms({
    dealerId: input.dealerId,
    userId: input.userId,
    phone: visit.customer.phone,
    templateKey: FEEDBACK_TEMPLATE_KEY,
    customerId: visit.customer.id,
    context: {
      customerName: visit.customer.name,
      extra: { var: dealer?.name ?? "" },
    },
  });

  // Stamped only on a real acceptance, so a failure can be retried later.
  if (result.status === "sent") {
    await db.serviceVisit.update({
      where: { id: visit.id },
      data: { feedbackSmsAt: new Date(), feedbackSmsLogId: result.logId ?? null },
    });
  }

  return {
    status: "success",
    message:
      result.status === "sent"
        ? "Visit closed and the feedback SMS is away."
        : `Visit closed, but the SMS did not go: ${result.message}`,
    sms: {
      attempted: true,
      sent: result.status === "sent",
      reason: result.status === "sent" ? undefined : result.message,
    },
  };
}

/** Retries the feedback SMS for a visit whose earlier attempt failed. */
export async function resendFeedbackSms(input: {
  dealerId: string;
  userId: string;
  visitId: string;
}) {
  const visit = await db.serviceVisit.findFirst({
    where: { id: input.visitId, dealerId: input.dealerId },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  if (!visit) return { status: "error" as const, message: "Visit not found" };
  if (visit.feedbackSmsAt) {
    return { status: "error" as const, message: "This customer has already had the SMS." };
  }

  const dealer = await db.dealer.findUnique({
    where: { id: input.dealerId },
    select: { name: true },
  });

  const result = await sendDealerSms({
    dealerId: input.dealerId,
    userId: input.userId,
    phone: visit.customer.phone,
    templateKey: FEEDBACK_TEMPLATE_KEY,
    customerId: visit.customer.id,
    context: { customerName: visit.customer.name, extra: { var: dealer?.name ?? "" } },
  });

  if (result.status === "sent") {
    await db.serviceVisit.update({
      where: { id: visit.id },
      data: { feedbackSmsAt: new Date(), feedbackSmsLogId: result.logId ?? null },
    });
  }

  return {
    status: result.status === "sent" ? ("success" as const) : ("error" as const),
    message: result.message,
  };
}
