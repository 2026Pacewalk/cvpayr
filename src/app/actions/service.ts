"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/server/events";
import { upsertCustomer } from "@/server/leads";
import {
  closeServiceVisit,
  resendFeedbackSms,
  nextJobCardNumber,
  SERVICE_STATUSES,
} from "@/server/service";
import { normalisePhone } from "@/lib/utils";

export type ServiceActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const int = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const text = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Books a car in.
 *
 * The customer is created through the same dedupe path enquiries use, so a
 * service visit never forks a second customer record for someone who already
 * bought a car here — which is the whole point of having their history.
 */
export async function createServiceVisit(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  let customerId = text(formData.get("customerId"));
  if (!customerId) {
    const name = text(formData.get("customerName"));
    const phone = text(formData.get("customerPhone"));
    if (!name || !phone || normalisePhone(phone).length !== 10) {
      return {
        status: "error",
        message: "Choose an existing customer, or enter a name and a valid 10-digit mobile.",
        fieldErrors: { customerPhone: "Name and 10-digit mobile required" },
      };
    }
    const { customer } = await upsertCustomer({ dealerId: user.dealerId, name, phone });
    customerId = customer.id;
  } else {
    const owned = await db.customer.findFirst({
      where: { id: customerId, dealerId: user.dealerId },
      select: { id: true },
    });
    if (!owned) return { status: "error", message: "That customer is not on your account." };
  }

  const branchId = text(formData.get("branchId"));
  if (branchId && !isBranchAllowed(user, branchId)) {
    return { status: "error", message: "You do not have access to that branch." };
  }

  const promised = text(formData.get("promisedAt"));

  const visit = await db.serviceVisit.create({
    data: {
      dealerId: user.dealerId,
      branchId,
      customerId,
      jobCardNumber: text(formData.get("jobCardNumber")) ?? (await nextJobCardNumber(user.dealerId)),
      registrationNumber: text(formData.get("registrationNumber"))?.toUpperCase() ?? null,
      make: text(formData.get("make")),
      model: text(formData.get("model")),
      odometerKm: int(formData.get("odometerKm")),
      serviceType: text(formData.get("serviceType")) ?? "periodic",
      complaint: text(formData.get("complaint")),
      promisedAt: promised ? new Date(promised) : null,
      assignedToId: text(formData.get("assignedToId")) ?? user.id,
      notes: text(formData.get("notes")),
      status: "open",
    },
    include: { customer: { select: { name: true } } },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "service",
    entityId: visit.id,
    summary: `Booked in ${visit.customer.name}${visit.registrationNumber ? ` (${visit.registrationNumber})` : ""}`,
  });

  revalidatePath("/service");
  redirect(`/service/${visit.id}?created=1`);
}

export async function updateServiceVisit(
  visitId: string,
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  const existing = await db.serviceVisit.findFirst({
    where: { id: visitId, dealerId: user.dealerId },
    select: { id: true },
  });
  if (!existing) return { status: "error", message: "Visit not found" };

  const promised = text(formData.get("promisedAt"));

  await db.serviceVisit.update({
    where: { id: visitId },
    data: {
      registrationNumber: text(formData.get("registrationNumber"))?.toUpperCase() ?? null,
      make: text(formData.get("make")),
      model: text(formData.get("model")),
      odometerKm: int(formData.get("odometerKm")),
      serviceType: text(formData.get("serviceType")) ?? "periodic",
      complaint: text(formData.get("complaint")),
      workDone: text(formData.get("workDone")),
      amount: int(formData.get("amount")),
      promisedAt: promised ? new Date(promised) : null,
      assignedToId: text(formData.get("assignedToId")),
      notes: text(formData.get("notes")),
    },
  });

  revalidatePath("/service");
  revalidatePath(`/service/${visitId}`);
  return { status: "success", message: "Saved" };
}

/** Moves a visit along the board. Closing goes through `closeVisit` instead. */
export async function setServiceStatus(visitId: string, status: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  if (!SERVICE_STATUSES.some((s) => s.value === status)) {
    return { status: "error" as const, message: "Unknown status" };
  }
  if (status === "closed") {
    return {
      status: "error" as const,
      message: "Use Close & notify, so the customer gets their feedback message.",
    };
  }

  const result = await db.serviceVisit.updateMany({
    where: { id: visitId, dealerId: user.dealerId },
    data: { status, ...(status === "cancelled" ? { closedAt: new Date() } : {}) },
  });
  if (!result.count) return { status: "error" as const, message: "Visit not found" };

  revalidatePath("/service");
  revalidatePath(`/service/${visitId}`);
  return { status: "success" as const, message: `Marked ${status.replace(/_/g, " ")}` };
}

/**
 * Hands the car back.
 *
 * The visit closes whether or not the SMS goes; the result says plainly which
 * happened rather than implying the customer was messaged.
 */
export async function closeVisit(input: {
  visitId: string;
  workDone?: string;
  amount?: string;
  sendSms?: boolean;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  const result = await closeServiceVisit({
    dealerId: user.dealerId,
    userId: user.id,
    visitId: input.visitId,
    workDone: input.workDone?.trim() || undefined,
    amount: input.amount ? int(input.amount) : undefined,
    sendFeedbackSms: input.sendSms !== false,
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "status_change",
    entity: "service",
    entityId: input.visitId,
    summary: `Closed a service visit${result.sms.sent ? " and sent the feedback SMS" : ""}`,
  });

  revalidatePath("/service");
  revalidatePath(`/service/${input.visitId}`);
  return result;
}

export async function retryFeedbackSms(visitId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  const result = await resendFeedbackSms({
    dealerId: user.dealerId,
    userId: user.id,
    visitId,
  });

  revalidatePath(`/service/${visitId}`);
  return result;
}

export async function deleteServiceVisit(visitId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SERVICE_MANAGE);

  const result = await db.serviceVisit.deleteMany({
    where: { id: visitId, dealerId: user.dealerId },
  });
  if (!result.count) return { status: "error" as const, message: "Visit not found" };

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "delete",
    entity: "service",
    entityId: visitId,
    summary: "Deleted a service visit",
  });

  revalidatePath("/service");
  redirect("/service?deleted=1");
}
