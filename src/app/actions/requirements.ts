"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { upsertCustomer } from "@/server/leads";
import { matchVehiclesForRequirement } from "@/server/matching";
import { audit, notifyRecipients } from "@/server/events";
import { normalisePhone } from "@/lib/utils";
import { dedupe, dayKey } from "@/lib/notifications";

export type RequirementState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
  make: z.string().trim().optional(),
  model: z.string().trim().optional(),
  yearMin: z.string().optional(),
  kmMax: z.string().optional(),
  ownershipMax: z.string().optional(),
  colour: z.string().trim().optional(),
  city: z.string().trim().optional(),
  branchId: z.string().optional(),
  notes: z.string().trim().optional(),
  priority: z.string().optional(),
  expiresAt: z.string().optional(),
});

const int = (v?: string) => {
  if (!v || !v.trim()) return null;
  const n = Number(v.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function collectFields(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false as const, fieldErrors };
  }
  const d = parsed.data;
  return {
    ok: true as const,
    d,
    data: {
      budgetMin: int(d.budgetMin),
      budgetMax: int(d.budgetMax),
      make: d.make || null,
      model: d.model || null,
      fuelTypes: JSON.stringify(formData.getAll("fuelTypes").map(String).filter(Boolean)),
      transmissions: JSON.stringify(formData.getAll("transmissions").map(String).filter(Boolean)),
      bodyTypes: JSON.stringify(formData.getAll("bodyTypes").map(String).filter(Boolean)),
      yearMin: int(d.yearMin),
      kmMax: int(d.kmMax),
      ownershipMax: int(d.ownershipMax),
      colour: d.colour || null,
      city: d.city || null,
      branchId: d.branchId || null,
      notes: d.notes || null,
      priority: d.priority || "medium",
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    },
  };
}

/* ------------------------------ CREATE -------------------------------- */

export async function createRequirement(
  _prev: RequirementState,
  formData: FormData,
): Promise<RequirementState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const parsed = collectFields(formData);
  if (!parsed.ok) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const { d, data } = parsed;

  // Either an existing customer, or enough to create one — reusing the same
  // dedupe path as enquiries so a requirement never forks a customer record.
  let customerId = d.customerId || null;
  if (!customerId) {
    if (!d.customerName || !d.customerPhone || normalisePhone(d.customerPhone).length !== 10) {
      return {
        status: "error",
        message: "Choose an existing customer, or enter a name and valid mobile number.",
        fieldErrors: { customerPhone: "Name and 10-digit mobile required" },
      };
    }
    const { customer } = await upsertCustomer({
      dealerId: user.dealerId,
      name: d.customerName,
      phone: d.customerPhone,
    });
    customerId = customer.id;
  } else {
    const owned = await db.customer.findFirst({
      where: { id: customerId, dealerId: user.dealerId },
      select: { id: true },
    });
    if (!owned) return { status: "error", message: "That customer does not belong to your dealership." };
  }

  if (data.budgetMin && data.budgetMax && data.budgetMin > data.budgetMax) {
    return {
      status: "error",
      message: "The minimum budget is higher than the maximum.",
      fieldErrors: { budgetMin: "Higher than the maximum" },
    };
  }

  const requirement = await db.customerRequirement.create({
    data: { ...data, dealerId: user.dealerId, customerId, createdById: user.id },
    include: { customer: { select: { name: true } } },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "requirement",
    entityId: requirement.id,
    summary: `Recorded a requirement for ${requirement.customer.name}`,
  });

  revalidatePath("/requirements");
  redirect(`/requirements/${requirement.id}?created=1`);
}

/* ------------------------------ UPDATE -------------------------------- */

export async function updateRequirement(
  requirementId: string,
  _prev: RequirementState,
  formData: FormData,
): Promise<RequirementState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const existing = await db.customerRequirement.findFirst({
    where: { id: requirementId, dealerId: user.dealerId },
  });
  if (!existing) return { status: "error", message: "Requirement not found" };

  const parsed = collectFields(formData);
  if (!parsed.ok) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }

  await db.customerRequirement.update({
    where: { id: requirementId },
    data: parsed.data,
  });

  revalidatePath(`/requirements/${requirementId}`);
  redirect(`/requirements/${requirementId}?updated=1`);
}

export async function setRequirementStatus(
  requirementId: string,
  status: string,
  reason?: string,
) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const requirement = await db.customerRequirement.findFirst({
    where: { id: requirementId, dealerId: user.dealerId },
    include: { customer: { select: { name: true } } },
  });
  if (!requirement) return { status: "error" as const, message: "Requirement not found" };

  const closing = ["fulfilled", "expired", "cancelled"].includes(status);

  await db.customerRequirement.update({
    where: { id: requirementId },
    data: {
      status,
      closedAt: closing ? new Date() : null,
      closedReason: closing ? (reason ?? null) : null,
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "status_change",
    entity: "requirement",
    entityId: requirementId,
    summary: `${requirement.customer.name}'s requirement → ${status}`,
  });

  revalidatePath("/requirements");
  revalidatePath(`/requirements/${requirementId}`);
  return { status: "success" as const, message: `Requirement marked ${status}` };
}

/* ------------------------------ MATCHES ------------------------------- */

/** Live matches for one requirement, used by the detail screen. */
export async function getMatchesForRequirement(requirementId: string) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) return [];

  const requirement = await db.customerRequirement.findFirst({
    where: { id: requirementId, dealerId: user.dealerId },
  });
  if (!requirement) return [];

  const matches = await matchVehiclesForRequirement(requirement, user.dealerId, { limit: 24 });

  await db.customerRequirement.update({
    where: { id: requirementId },
    data: { lastMatchedAt: new Date() },
  });

  return matches.map((m) => ({
    score: m.score,
    criteria: m.criteria,
    vehicle: {
      id: m.vehicle.id,
      stockId: m.vehicle.stockId,
      make: m.vehicle.make,
      model: m.vehicle.model,
      variant: m.vehicle.variant,
      year: m.vehicle.year,
      fuelType: m.vehicle.fuelType,
      transmission: m.vehicle.transmission,
      kmDriven: m.vehicle.kmDriven,
      sellingPrice: m.vehicle.sellingPrice,
      status: m.vehicle.status,
      branchName: m.vehicle.branch.name,
      imageUrl: m.vehicle.images[0]?.url ?? null,
    },
  }));
}

/**
 * Notifies the people who own the matching customers that a new car fits their
 * brief. Called after a vehicle is published.
 */
export async function notifyMatchesForVehicle(vehicleId: string) {
  const user = await requireDealerUser();

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, dealerId: user.dealerId },
    include: { branch: { select: { city: true, name: true } } },
  });
  if (!vehicle) return { status: "error" as const, message: "Vehicle not found" };

  const { matchRequirementsForVehicle } = await import("@/server/matching");
  const matches = await matchRequirementsForVehicle(vehicle, user.dealerId, { limit: 50 });
  if (!matches.length) return { status: "success" as const, count: 0 };

  // One notification per salesperson who owns a matching brief, plus the lead
  // managers — not one per match, or a dealer adding stock gets twenty pings.
  const owners = [...new Set(matches.map((m) => m.requirement.createdById).filter(Boolean))];
  const names = matches.slice(0, 3).map((m) => m.requirement.customer.name).join(", ");

  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.LEADS_VIEW_ALL],
      branchId: vehicle.branchId,
      includeUserIds: owners,
      excludeUserIds: [user.id],
    },
    {
      type: "requirement.match",
      title: `${matches.length} customer${matches.length === 1 ? "" : "s"} may want ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      body: `${names}${matches.length > 3 ? ` and ${matches.length - 3} more` : ""} asked for something like this. Now at ${vehicle.branch.name}.`,
      link: `/inventory/${vehicle.id}#matches`,
      priority: "high",
      actorId: user.id,
      entityType: "vehicle",
      entityId: vehicle.id,
      // One alert per car per day, however many times it is re-saved.
      dedupeKey: dedupe(["requirement.match", vehicle.id, dayKey()]),
      meta: { matchCount: matches.length, stockId: vehicle.stockId },
    },
  );

  await db.customerRequirement.updateMany({
    where: { id: { in: matches.map((m) => m.requirement.id) } },
    data: { lastNotifiedAt: new Date(), status: "matched" },
  });

  revalidatePath("/requirements");
  return { status: "success" as const, count: matches.length };
}

export async function deleteRequirement(requirementId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_DELETE);

  const requirement = await db.customerRequirement.findFirst({
    where: { id: requirementId, dealerId: user.dealerId },
    include: { customer: { select: { name: true } } },
  });
  if (!requirement) return { status: "error" as const, message: "Requirement not found" };

  await db.customerRequirement.delete({ where: { id: requirementId } });
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "delete",
    entity: "requirement",
    entityId: requirementId,
    summary: `Deleted ${requirement.customer.name}'s requirement`,
  });

  revalidatePath("/requirements");
  redirect("/requirements?deleted=1");
}
