"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, can, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import {
  captureEnquiry, moveLeadStage, assignLead, autoAssignLead, upsertCustomer,
} from "@/server/leads";
import { audit, notify, notifyRecipients } from "@/server/events";
import { LEAD_STAGES, type LeadStage } from "@/lib/constants";
import { normalisePhone, vehicleTitle } from "@/lib/utils";

export type LeadActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

/** Ensures the caller is allowed to touch this specific lead. */
async function loadLead(dealerId: string, leadId: string) {
  return db.lead.findFirst({
    where: { id: leadId, dealerId },
    include: { customer: true, vehicle: { select: { id: true, stockId: true, year: true, make: true, model: true, variant: true } } },
  });
}

/* ------------------------------ CREATE -------------------------------- */

const manualLeadSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer name"),
  phone: z.string().trim().refine((v) => normalisePhone(v).length === 10, "Enter a valid 10-digit mobile"),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  city: z.string().trim().optional(),
  vehicleId: z.string().optional(),
  branchId: z.string().optional(),
  ownerId: z.string().optional(),
  source: z.string().optional(),
  priority: z.string().optional(),
  requirement: z.string().trim().optional(),
  message: z.string().trim().optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
});

export async function createLead(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const parsed = manualLeadSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  const d = parsed.data;
  const result = await captureEnquiry({
    dealerId: user.dealerId,
    name: d.name,
    phone: d.phone,
    whatsapp: d.whatsapp || d.phone,
    email: d.email || null,
    city: d.city || null,
    message: d.message || null,
    requirement: d.requirement || null,
    vehicleId: d.vehicleId || null,
    branchId: d.branchId || null,
    source: d.source || "walk_in",
  });

  const ownerId = d.ownerId === "auto" ? null : d.ownerId || user.id;
  if (d.ownerId === "auto") {
    await autoAssignLead({
      dealerId: user.dealerId,
      leadId: result.lead.id,
      branchId: d.branchId || null,
      actorId: user.id,
    });
  } else if (ownerId) {
    await assignLead({ dealerId: user.dealerId, leadId: result.lead.id, ownerId, actorId: user.id });
  }

  await db.lead.update({
    where: { id: result.lead.id },
    data: {
      priority: d.priority || "medium",
      budgetMin: d.budgetMin ? Number(d.budgetMin) : null,
      budgetMax: d.budgetMax ? Number(d.budgetMax) : null,
    },
  });

  revalidatePath("/leads");
  redirect(`/leads/${result.lead.id}?created=1`);
}

/* --------------------------- STAGE / ASSIGN --------------------------- */

export async function updateLeadStage(leadId: string, stage: string, lostReason?: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);
  if (!LEAD_STAGES.includes(stage as LeadStage)) {
    return { status: "error" as const, message: "Unknown stage" };
  }

  const lead = await loadLead(user.dealerId, leadId);
  if (!lead) return { status: "error" as const, message: "Lead not found" };
  if (!isBranchAllowed(user, lead.branchId)) {
    return { status: "error" as const, message: "This lead belongs to another branch" };
  }

  await moveLeadStage({
    dealerId: user.dealerId,
    leadId,
    stage: stage as LeadStage,
    userId: user.id,
    lostReason,
  });

  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath(`/leads/${leadId}`);
  return { status: "success" as const };
}

export async function reassignLead(leadId: string, ownerId: string | null) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_ASSIGN);

  if (ownerId === "auto") {
    const lead = await loadLead(user.dealerId, leadId);
    await autoAssignLead({
      dealerId: user.dealerId,
      leadId,
      branchId: lead?.branchId ?? null,
      actorId: user.id,
    });
  } else {
    await assignLead({ dealerId: user.dealerId, leadId, ownerId, actorId: user.id });
  }

  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath(`/leads/${leadId}`);
  return { status: "success" as const };
}

export async function updateLeadFields(
  leadId: string,
  data: { priority?: string; branchId?: string | null; vehicleId?: string | null; requirement?: string },
) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const lead = await loadLead(user.dealerId, leadId);
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  await db.lead.update({
    where: { id: leadId },
    data: {
      ...(data.priority ? { priority: data.priority } : {}),
      ...(data.branchId !== undefined ? { branchId: data.branchId || null } : {}),
      ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId || null } : {}),
      ...(data.requirement !== undefined ? { requirement: data.requirement } : {}),
      lastActivityAt: new Date(),
    },
  });

  if (data.vehicleId && data.vehicleId !== lead.vehicleId) {
    const vehicle = await db.vehicle.findFirst({
      where: { id: data.vehicleId, dealerId: user.dealerId },
      select: { stockId: true, year: true, make: true, model: true, variant: true },
    });
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId,
        userId: user.id,
        type: "note",
        title: "Interested vehicle updated",
        body: vehicle ? `${vehicleTitle(vehicle)} (${vehicle.stockId})` : undefined,
      },
    });
  }

  revalidatePath(`/leads/${leadId}`);
  return { status: "success" as const };
}

/* ------------------------------ ACTIVITY ------------------------------ */

export async function addLeadActivity(
  leadId: string,
  input: { type: string; title: string; body?: string },
) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const lead = await loadLead(user.dealerId, leadId);
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  await db.leadActivity.create({
    data: {
      dealerId: user.dealerId,
      leadId,
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body || null,
    },
  });

  await db.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });

  revalidatePath(`/leads/${leadId}`);
  return { status: "success" as const };
}

export async function addLeadNote(leadId: string, body: string) {
  if (!body.trim()) return { status: "error" as const, message: "Write something first" };
  return addLeadActivity(leadId, { type: "note", title: "Note added", body });
}

export async function logCall(leadId: string, outcome: string, note?: string) {
  return addLeadActivity(leadId, {
    type: "call",
    title: `Call outcome — ${outcome}`,
    body: note,
  });
}

/* ----------------------------- FOLLOW-UPS ----------------------------- */

export async function createFollowUp(input: {
  leadId: string;
  dueAt: string;
  type: string;
  note?: string;
  assignedToId?: string | null;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const lead = await loadLead(user.dealerId, input.leadId);
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return { status: "error" as const, message: "Pick a valid date and time" };
  }

  await db.followUp.create({
    data: {
      dealerId: user.dealerId,
      leadId: input.leadId,
      assignedToId: input.assignedToId ?? lead.ownerId ?? user.id,
      dueAt,
      type: input.type,
      note: input.note || null,
    },
  });

  await db.lead.update({
    where: { id: input.leadId },
    data: { nextFollowUpAt: dueAt, lastActivityAt: new Date() },
  });

  await db.leadActivity.create({
    data: {
      dealerId: user.dealerId,
      leadId: input.leadId,
      userId: user.id,
      type: "follow_up",
      title: `Follow-up scheduled — ${input.type}`,
      body: dueAt.toLocaleString("en-IN"),
    },
  });

  revalidatePath("/followups");
  revalidatePath(`/leads/${input.leadId}`);
  return { status: "success" as const, message: "Follow-up scheduled" };
}

export async function completeFollowUp(followUpId: string, outcome?: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const followUp = await db.followUp.findFirst({
    where: { id: followUpId, dealerId: user.dealerId },
  });
  if (!followUp) return { status: "error" as const, message: "Follow-up not found" };

  await db.followUp.update({
    where: { id: followUpId },
    data: { status: "done", completedAt: new Date(), outcome: outcome || null },
  });

  await db.leadActivity.create({
    data: {
      dealerId: user.dealerId,
      leadId: followUp.leadId,
      userId: user.id,
      type: "follow_up",
      title: "Follow-up completed",
      body: outcome || null,
    },
  });

  // Point `nextFollowUpAt` at whatever is still pending, so lists stay accurate.
  const nextPending = await db.followUp.findFirst({
    where: { leadId: followUp.leadId, status: "pending" },
    orderBy: { dueAt: "asc" },
  });
  await db.lead.update({
    where: { id: followUp.leadId },
    data: { nextFollowUpAt: nextPending?.dueAt ?? null, lastActivityAt: new Date() },
  });

  revalidatePath("/followups");
  revalidatePath("/dashboard");
  revalidatePath(`/leads/${followUp.leadId}`);
  return { status: "success" as const, message: "Marked done" };
}

export async function rescheduleFollowUp(followUpId: string, dueAt: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const followUp = await db.followUp.findFirst({
    where: { id: followUpId, dealerId: user.dealerId },
  });
  if (!followUp) return { status: "error" as const, message: "Follow-up not found" };

  const date = new Date(dueAt);
  await db.followUp.update({ where: { id: followUpId }, data: { dueAt: date } });
  await db.lead.update({ where: { id: followUp.leadId }, data: { nextFollowUpAt: date } });

  revalidatePath("/followups");
  revalidatePath(`/leads/${followUp.leadId}`);
  return { status: "success" as const, message: "Rescheduled" };
}

/* ----------------------------- TEST DRIVES ---------------------------- */

export async function createTestDrive(input: {
  leadId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  vehicleId?: string | null;
  branchId?: string | null;
  scheduledAt: string;
  assignedToId?: string | null;
  note?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  let customerId = input.customerId ?? null;
  if (!customerId && input.leadId) {
    const lead = await loadLead(user.dealerId, input.leadId);
    customerId = lead?.customerId ?? null;
  }
  if (!customerId) {
    if (!input.customerName || !input.customerPhone) {
      return { status: "error" as const, message: "Customer name and mobile are required" };
    }
    const { customer } = await upsertCustomer({
      dealerId: user.dealerId,
      name: input.customerName,
      phone: input.customerPhone,
    });
    customerId = customer.id;
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { status: "error" as const, message: "Pick a valid date and time" };
  }

  const testDrive = await db.testDrive.create({
    data: {
      dealerId: user.dealerId,
      leadId: input.leadId ?? null,
      customerId,
      vehicleId: input.vehicleId ?? null,
      branchId: input.branchId ?? null,
      assignedToId: input.assignedToId ?? user.id,
      scheduledAt,
      status: "confirmed",
      note: input.note || null,
    },
  });

  if (input.leadId) {
    await moveLeadStage({
      dealerId: user.dealerId,
      leadId: input.leadId,
      stage: "test_drive_scheduled",
      userId: user.id,
    });
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId: input.leadId,
        userId: user.id,
        type: "test_drive",
        title: "Test drive scheduled",
        body: scheduledAt.toLocaleString("en-IN"),
      },
    });
  }

  const assignee = testDrive.assignedToId;
  if (assignee && assignee !== user.id) {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { name: true, phone: true },
    });
    await notify({
      dealerId: user.dealerId,
      userId: assignee,
      type: "testdrive.requested",
      title: `Test drive assigned to you: ${customer?.name ?? "customer"}`,
      body: scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      link: "/test-drives",
      branchId: testDrive.branchId,
      actorId: user.id,
      entityType: "testdrive",
      entityId: testDrive.id,
      meta: { phone: customer?.phone ?? null, customerName: customer?.name ?? null },
    });
  }

  revalidatePath("/test-drives");
  if (input.leadId) revalidatePath(`/leads/${input.leadId}`);
  return { status: "success" as const, message: "Test drive scheduled", id: testDrive.id };
}

export async function updateTestDriveStatus(
  testDriveId: string,
  status: string,
  feedback?: string,
) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const testDrive = await db.testDrive.findFirst({
    where: { id: testDriveId, dealerId: user.dealerId },
  });
  if (!testDrive) return { status: "error" as const, message: "Test drive not found" };

  await db.testDrive.update({
    where: { id: testDriveId },
    data: { status, feedback: feedback ?? testDrive.feedback },
  });

  if (testDrive.leadId) {
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId: testDrive.leadId,
        userId: user.id,
        type: "test_drive",
        title: `Test drive ${status.replace(/_/g, " ")}`,
        body: feedback || null,
      },
    });
    if (status === "completed") {
      await moveLeadStage({
        dealerId: user.dealerId,
        leadId: testDrive.leadId,
        stage: "test_drive_completed",
        userId: user.id,
      });
    }
  }

  if (["cancelled", "no_show"].includes(status)) {
    const customer = await db.customer.findUnique({
      where: { id: testDrive.customerId },
      select: { name: true },
    });
    await notifyRecipients(
      {
        dealerId: user.dealerId,
        permissions: [PERMISSIONS.LEADS_VIEW_ALL],
        branchId: testDrive.branchId,
        includeUserIds: [testDrive.assignedToId],
        excludeUserIds: [user.id],
      },
      {
        type: "testdrive.cancelled",
        title: `Test drive ${status === "no_show" ? "no-show" : "cancelled"}: ${customer?.name ?? "customer"}`,
        body: testDrive.scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        link: "/test-drives",
        actorId: user.id,
        entityType: "testdrive",
        entityId: testDrive.id,
      },
    );
  }

  revalidatePath("/test-drives");
  revalidatePath("/dashboard");
  return { status: "success" as const, message: "Updated" };
}

/* ------------------------------- DELETE ------------------------------- */

export async function deleteLead(leadId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_DELETE);

  const lead = await loadLead(user.dealerId, leadId);
  if (!lead) return { status: "error" as const, message: "Lead not found" };

  await db.lead.delete({ where: { id: leadId } });
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "delete",
    entity: "lead",
    entityId: leadId,
    summary: `Deleted lead ${lead.reference} (${lead.customer.name})`,
  });

  revalidatePath("/leads");
  redirect("/leads?deleted=1");
}

/* --------------------------- SHARED CATALOG --------------------------- */

function shareCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Quick Sales Tool output: turn a shortlist into a link the salesperson can
 * WhatsApp to the customer while still on the call.
 */
export async function createSharedCatalog(input: {
  title: string;
  subtitle?: string;
  vehicleIds: string[];
  customerName?: string;
  customerPhone?: string;
  notes?: Record<string, string>;
  kind?: string;
  filters?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.CATALOG_SHARE);

  if (!input.vehicleIds.length) {
    return { status: "error" as const, message: "Select at least one vehicle" };
  }

  const vehicles = await db.vehicle.findMany({
    where: { id: { in: input.vehicleIds }, dealerId: user.dealerId },
    select: { id: true },
  });

  const catalog = await db.sharedCatalog.create({
    data: {
      dealerId: user.dealerId,
      code: shareCode(),
      title: input.title,
      subtitle: input.subtitle || null,
      kind: input.kind ?? "shortlist",
      filters: input.filters ?? null,
      createdById: user.id,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone ? normalisePhone(input.customerPhone) : null,
      items: {
        create: vehicles.map((v, i) => ({
          vehicleId: v.id,
          sortOrder: i,
          note: input.notes?.[v.id] || null,
        })),
      },
    },
  });

  // A shortlist built for a named customer is itself a sales signal — log it.
  if (input.customerName && input.customerPhone) {
    const { customer } = await upsertCustomer({
      dealerId: user.dealerId,
      name: input.customerName,
      phone: input.customerPhone,
    });
    const openLead = await db.lead.findFirst({
      where: {
        dealerId: user.dealerId,
        customerId: customer.id,
        stage: { notIn: ["won", "lost", "not_interested"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (openLead) {
      await db.leadActivity.create({
        data: {
          dealerId: user.dealerId,
          leadId: openLead.id,
          userId: user.id,
          type: "note",
          title: `Shared a shortlist of ${vehicles.length} cars`,
          body: `/d/${user.dealerSlug}/c/${catalog.code}`,
        },
      });
    }
  }

  await notify({
    dealerId: user.dealerId,
    userId: user.id,
    type: "catalog.shared",
    title: `Shortlist created: ${input.title}`,
    body: `${vehicles.length} vehicles · /d/${user.dealerSlug}/c/${catalog.code}`,
    link: "/quick-search",
    entityType: "catalog",
    entityId: catalog.id,
  });

  revalidatePath("/quick-search");
  return {
    status: "success" as const,
    code: catalog.code,
    url: `/d/${user.dealerSlug}/c/${catalog.code}`,
  };
}

/* ------------------------------ CUSTOMER ------------------------------ */

export async function updateCustomer(
  customerId: string,
  data: { name?: string; email?: string; city?: string; whatsapp?: string; notes?: string },
) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.CUSTOMERS_MANAGE);

  const customer = await db.customer.findFirst({
    where: { id: customerId, dealerId: user.dealerId },
  });
  if (!customer) return { status: "error" as const, message: "Customer not found" };

  await db.customer.update({
    where: { id: customerId },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.city !== undefined ? { city: data.city || null } : {}),
      ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp ? normalisePhone(data.whatsapp) : null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    },
  });

  revalidatePath(`/customers/${customerId}`);
  return { status: "success" as const, message: "Customer updated" };
}

/* ---------------------------- NOTIFICATIONS --------------------------- */

export async function markNotificationsRead(ids?: string[]) {
  const user = await requireDealerUser();
  await db.notification.updateMany({
    where: {
      dealerId: user.dealerId,
      ...(ids?.length ? { id: { in: ids } } : {}),
      OR: [{ userId: user.id }, { userId: null }],
    },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  return { status: "success" as const };
}

/** Used by the leads list to check a permission on the server before rendering actions. */
export async function currentUserCanAssign() {
  const user = await requireDealerUser();
  return can(user, PERMISSIONS.LEADS_ASSIGN);
}
