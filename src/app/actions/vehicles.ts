"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, isBranchAllowed, can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { assertWithinLimit, PlanLimitError, resolvePlan } from "@/lib/plan";
import { audit, diffFields, notify, notifyRecipients } from "@/server/events";
import { setVehicleStatus } from "@/server/leads";
import { nextStockId } from "@/server/inventory";
import { VEHICLE_STATUSES } from "@/lib/constants";
import { vehicleTitle, formatPrice } from "@/lib/utils";

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  vehicleId?: string;
};

const numeric = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const optionalDate = (v: unknown) =>
  v && String(v).length ? new Date(String(v)) : undefined;

const vehicleSchema = z.object({
  branchId: z.string().min(1, "Choose a branch"),
  stockId: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  make: z.string().trim().min(1, "Brand is required"),
  model: z.string().trim().min(1, "Model is required"),
  variant: z.string().trim().optional(),
  year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  registrationYear: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  fuelType: z.string().min(1, "Fuel type is required"),
  transmission: z.string().min(1, "Transmission is required"),
  bodyType: z.string().min(1, "Body type is required"),
  colour: z.string().trim().optional(),
  ownership: z.coerce.number().int().min(1).max(9).default(1),
  kmDriven: z.coerce.number().int().min(0).max(999999),
  registrationState: z.string().trim().optional(),
  rto: z.string().trim().optional(),

  insuranceStatus: z.string().optional(),
  insuranceValidTill: z.string().optional(),
  fitnessValidTill: z.string().optional(),
  pucValidTill: z.string().optional(),

  sellingPrice: z.coerce.number().int().min(1, "Selling price is required"),
  originalPrice: z.string().optional(),
  negotiable: z.string().optional(),
  minAcceptablePrice: z.string().optional(),
  purchasePrice: z.string().optional(),
  refurbishmentCost: z.string().optional(),

  conditionRating: z.string().optional(),
  serviceHistory: z.string().optional(),
  accidental: z.string().optional(),
  floodDamaged: z.string().optional(),
  repaintedPanels: z.string().optional(),
  tyreCondition: z.string().trim().optional(),
  batteryCondition: z.string().trim().optional(),
  engineCondition: z.string().trim().optional(),
  interiorCondition: z.string().trim().optional(),
  exteriorCondition: z.string().trim().optional(),
  numberOfKeys: z.string().optional(),
  serviceRecordsAvailable: z.string().optional(),
  rcAvailable: z.string().optional(),
  insuranceAvailable: z.string().optional(),

  description: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  status: z.enum(VEHICLE_STATUSES).default("draft"),
  isFeatured: z.string().optional(),
});

function parseVehicleForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false as const, fieldErrors };
  }

  const d = parsed.data;
  const features = formData.getAll("features").map(String).filter(Boolean);
  const customFeatures = String(formData.get("customFeatures") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ok: true as const,
    data: {
      branchId: d.branchId,
      stockId: d.stockId?.trim() || undefined,
      registrationNumber: d.registrationNumber || null,
      make: d.make,
      model: d.model,
      variant: d.variant || null,
      year: d.year,
      registrationYear: d.registrationYear ?? d.year,
      fuelType: d.fuelType,
      transmission: d.transmission,
      bodyType: d.bodyType,
      colour: d.colour || null,
      ownership: d.ownership,
      kmDriven: d.kmDriven,
      registrationState: d.registrationState || null,
      rto: d.rto || null,
      insuranceStatus: d.insuranceStatus || null,
      insuranceValidTill: optionalDate(d.insuranceValidTill) ?? null,
      fitnessValidTill: optionalDate(d.fitnessValidTill) ?? null,
      pucValidTill: optionalDate(d.pucValidTill) ?? null,
      sellingPrice: d.sellingPrice,
      originalPrice: numeric(d.originalPrice) ?? null,
      negotiable: d.negotiable === "on",
      minAcceptablePrice: numeric(d.minAcceptablePrice) ?? null,
      purchasePrice: numeric(d.purchasePrice) ?? null,
      refurbishmentCost: numeric(d.refurbishmentCost) ?? 0,
      conditionRating: numeric(d.conditionRating) ?? null,
      serviceHistory: d.serviceHistory || null,
      accidental: d.accidental === "on",
      floodDamaged: d.floodDamaged === "on",
      repaintedPanels: numeric(d.repaintedPanels) ?? 0,
      tyreCondition: d.tyreCondition || null,
      batteryCondition: d.batteryCondition || null,
      engineCondition: d.engineCondition || null,
      interiorCondition: d.interiorCondition || null,
      exteriorCondition: d.exteriorCondition || null,
      numberOfKeys: numeric(d.numberOfKeys) ?? 1,
      serviceRecordsAvailable: d.serviceRecordsAvailable === "on",
      rcAvailable: d.rcAvailable === "on",
      insuranceAvailable: d.insuranceAvailable === "on",
      description: d.description || null,
      internalNotes: d.internalNotes || null,
      status: d.status,
      isFeatured: d.isFeatured === "on",
      features: JSON.stringify([...features, ...customFeatures]),
    },
    images: formData.getAll("imageUrls").map(String).filter(Boolean),
    coverIndex: Number(formData.get("coverIndex") ?? 0),
    youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim(),
  };
}

/* ------------------------------ CREATE -------------------------------- */

export async function createVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_CREATE);

  const parsed = parseVehicleForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  if (!isBranchAllowed(user, parsed.data.branchId)) {
    return { status: "error", message: "You do not have access to that branch." };
  }

  try {
    await assertWithinLimit(user.dealerId, "vehicles");
  } catch (e) {
    if (e instanceof PlanLimitError) return { status: "error", message: e.message };
    throw e;
  }

  // Duplicate detection: the same registration number is almost always a re-entry.
  if (parsed.data.registrationNumber) {
    const existing = await db.vehicle.findFirst({
      where: {
        dealerId: user.dealerId,
        registrationNumber: parsed.data.registrationNumber,
        status: { not: "sold" },
      },
      select: { id: true, stockId: true },
    });
    if (existing) {
      return {
        status: "error",
        message: `A vehicle with registration ${parsed.data.registrationNumber} already exists (${existing.stockId}).`,
        fieldErrors: { registrationNumber: "Already in your inventory" },
      };
    }
  }

  const plan = await resolvePlan(user.dealerId);
  const stockId = parsed.data.stockId || (await nextStockId(user.dealerId));

  const vehicle = await db.vehicle.create({
    data: {
      ...parsed.data,
      stockId,
      dealerId: user.dealerId,
      createdById: user.id,
      // Cost fields are only accepted from users who are allowed to see them.
      purchasePrice: can(user, PERMISSIONS.INVENTORY_VIEW_COST) ? parsed.data.purchasePrice : null,
      minAcceptablePrice: can(user, PERMISSIONS.INVENTORY_VIEW_COST) ? parsed.data.minAcceptablePrice : null,
      refurbishmentCost: can(user, PERMISSIONS.INVENTORY_VIEW_COST) ? parsed.data.refurbishmentCost : 0,
      listedAt: parsed.data.status === "available" ? new Date() : null,
    },
  });

  const images = parsed.images.slice(0, plan.limits.maxImagesPerVehicle);
  if (images.length) {
    await db.vehicleImage.createMany({
      data: images.map((url, i) => ({
        vehicleId: vehicle.id,
        url,
        kind: "photo",
        sortOrder: i,
        isCover: i === (Number.isFinite(parsed.coverIndex) ? parsed.coverIndex : 0),
      })),
    });
  }
  if (parsed.youtubeUrl) {
    await db.vehicleImage.create({
      data: { vehicleId: vehicle.id, url: toEmbedUrl(parsed.youtubeUrl), kind: "youtube", sortOrder: 90 },
    });
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "vehicle",
    entityId: vehicle.id,
    summary: `Added ${stockId} ${vehicleTitle(vehicle)}`,
  });

  // Alert the team if this car answers a brief a customer already gave us.
  if (vehicle.status === "available") {
    const { notifyMatchesForVehicle } = await import("./requirements");
    await notifyMatchesForVehicle(vehicle.id);
  }

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  redirect(`/inventory/${vehicle.id}?created=1`);
}

/* ------------------------------ UPDATE -------------------------------- */

export async function updateVehicle(
  vehicleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_EDIT);

  const before = await db.vehicle.findFirst({
    where: { id: vehicleId, dealerId: user.dealerId },
  });
  if (!before) return { status: "error", message: "Vehicle not found." };
  if (!isBranchAllowed(user, before.branchId)) {
    return { status: "error", message: "You do not have access to this vehicle." };
  }

  const parsed = parseVehicleForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }

  const canCost = can(user, PERMISSIONS.INVENTORY_VIEW_COST);
  const data = {
    ...parsed.data,
    stockId: parsed.data.stockId || before.stockId,
    // Preserve private values when the editor cannot see them.
    purchasePrice: canCost ? parsed.data.purchasePrice : before.purchasePrice,
    minAcceptablePrice: canCost ? parsed.data.minAcceptablePrice : before.minAcceptablePrice,
    refurbishmentCost: canCost ? parsed.data.refurbishmentCost : before.refurbishmentCost,
    internalNotes: canCost ? parsed.data.internalNotes : before.internalNotes,
    listedAt:
      parsed.data.status === "available" && !before.listedAt ? new Date() : before.listedAt,
  };

  const vehicle = await db.vehicle.update({ where: { id: vehicleId }, data });

  // Replace the photo set only when the form actually submitted one.
  if (parsed.images.length) {
    const plan = await resolvePlan(user.dealerId);
    await db.vehicleImage.deleteMany({ where: { vehicleId, kind: "photo" } });
    await db.vehicleImage.createMany({
      data: parsed.images.slice(0, plan.limits.maxImagesPerVehicle).map((url, i) => ({
        vehicleId,
        url,
        kind: "photo",
        sortOrder: i,
        isCover: i === (Number.isFinite(parsed.coverIndex) ? parsed.coverIndex : 0),
      })),
    });
  }
  await db.vehicleImage.deleteMany({ where: { vehicleId, kind: "youtube" } });
  if (parsed.youtubeUrl) {
    await db.vehicleImage.create({
      data: { vehicleId, url: toEmbedUrl(parsed.youtubeUrl), kind: "youtube", sortOrder: 90 },
    });
  }

  const changes = diffFields(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "vehicle",
    entityId: vehicleId,
    summary: `Updated ${vehicle.stockId} ${vehicleTitle(vehicle)}`,
    diff: changes,
  });

  // A price move on live stock changes what everyone quotes, so it is announced.
  if (
    before.sellingPrice !== vehicle.sellingPrice &&
    ["available", "reserved"].includes(vehicle.status)
  ) {
    const down = vehicle.sellingPrice < before.sellingPrice;
    const delta = Math.abs(vehicle.sellingPrice - before.sellingPrice);
    await notifyRecipients(
      {
        dealerId: user.dealerId,
        permissions: [PERMISSIONS.INVENTORY_VIEW],
        branchId: vehicle.branchId,
        excludeUserIds: [user.id],
      },
      {
        type: "vehicle.price_changed",
        title: `${vehicle.stockId} price ${down ? "reduced" : "raised"} to ${formatPrice(vehicle.sellingPrice)}`,
        body: `${vehicleTitle(vehicle)} · ${down ? "down" : "up"} ${formatPrice(delta)} from ${formatPrice(before.sellingPrice)}`,
        link: `/inventory/${vehicleId}`,
        actorId: user.id,
        entityType: "vehicle",
        entityId: vehicleId,
        meta: { from: before.sellingPrice, to: vehicle.sellingPrice },
      },
    );
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${vehicleId}`);
  redirect(`/inventory/${vehicleId}?updated=1`);
}

function toEmbedUrl(url: string) {
  const idMatch = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
  return idMatch ? `https://www.youtube.com/embed/${idMatch[1]}` : url;
}

/* --------------------------- STATUS / BULK ---------------------------- */

export async function changeVehicleStatus(vehicleId: string, status: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_EDIT);
  await setVehicleStatus(user.dealerId, vehicleId, status, user.id);
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${vehicleId}`);
  return { status: "success" as const };
}

export async function bulkUpdateStatus(vehicleIds: string[], status: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_EDIT);

  const vehicles = await db.vehicle.findMany({
    where: { id: { in: vehicleIds }, dealerId: user.dealerId },
    select: { id: true, branchId: true },
  });
  const allowed = vehicles.filter((v) => isBranchAllowed(user, v.branchId));

  for (const v of allowed) {
    await setVehicleStatus(user.dealerId, v.id, status, user.id);
  }

  revalidatePath("/inventory");
  return { status: "success" as const, count: allowed.length };
}

export async function toggleFeatured(vehicleId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_EDIT);
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, dealerId: user.dealerId } });
  if (!vehicle) return { status: "error" as const };
  await db.vehicle.update({
    where: { id: vehicleId },
    data: { isFeatured: !vehicle.isFeatured },
  });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${vehicleId}`);
  return { status: "success" as const, isFeatured: !vehicle.isFeatured };
}

/* ---------------------------- TRANSFER -------------------------------- */

export async function transferVehicle(vehicleId: string, toBranchId: string, note?: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_TRANSFER);

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, dealerId: user.dealerId },
    include: { branch: { select: { name: true } } },
  });
  if (!vehicle) return { status: "error" as const, message: "Vehicle not found" };

  const target = await db.branch.findFirst({
    where: { id: toBranchId, dealerId: user.dealerId },
    select: { id: true, name: true },
  });
  if (!target) return { status: "error" as const, message: "Branch not found" };
  if (target.id === vehicle.branchId) {
    return { status: "error" as const, message: "The vehicle is already at that branch" };
  }

  await db.$transaction([
    db.branchTransfer.create({
      data: {
        vehicleId,
        fromBranchId: vehicle.branchId,
        toBranchId: target.id,
        movedById: user.id,
        note: note || null,
      },
    }),
    db.vehicle.update({ where: { id: vehicleId }, data: { branchId: target.id } }),
  ]);

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "vehicle",
    entityId: vehicleId,
    summary: `${vehicle.stockId} transferred: ${vehicle.branch.name} → ${target.name}`,
  });

  // Both branches need to know: one lost a car, the other gained one.
  for (const branchId of [vehicle.branchId, target.id]) {
    await notifyRecipients(
      {
        dealerId: user.dealerId,
        permissions: [PERMISSIONS.INVENTORY_VIEW],
        branchId,
        excludeUserIds: [user.id],
      },
      {
        type: "vehicle.reserved",
        title: `${vehicle.stockId} moved to ${target.name}`,
        body: `${vehicleTitle(vehicle)} · from ${vehicle.branch.name}`,
        link: `/inventory/${vehicleId}`,
        priority: "medium",
        actorId: user.id,
        entityType: "vehicle",
        entityId: vehicleId,
      },
    );
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${vehicleId}`);
  return { status: "success" as const, message: `Moved to ${target.name}` };
}

/* ------------------------------ CLONE --------------------------------- */

export async function cloneVehicle(vehicleId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_CREATE);

  const source = await db.vehicle.findFirst({
    where: { id: vehicleId, dealerId: user.dealerId },
    include: { images: true },
  });
  if (!source) return { status: "error" as const, message: "Vehicle not found" };

  try {
    await assertWithinLimit(user.dealerId, "vehicles");
  } catch (e) {
    if (e instanceof PlanLimitError) return { status: "error" as const, message: e.message };
    throw e;
  }

  const stockId = await nextStockId(user.dealerId);
  const {
    id: _id, createdAt: _c, updatedAt: _u, soldAt: _s, listedAt: _l,
    viewCount: _v, enquiryCount: _e, registrationNumber: _r, images: _img, ...rest
  } = source;

  const clone = await db.vehicle.create({
    data: {
      ...rest,
      stockId,
      registrationNumber: null,
      status: "draft",
      isFeatured: false,
      viewCount: 0,
      enquiryCount: 0,
      listedAt: null,
      soldAt: null,
      createdById: user.id,
    },
  });

  if (source.images.length) {
    await db.vehicleImage.createMany({
      data: source.images.map((img) => ({
        vehicleId: clone.id,
        url: img.url,
        kind: img.kind,
        caption: img.caption,
        sortOrder: img.sortOrder,
        isCover: img.isCover,
      })),
    });
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "vehicle",
    entityId: clone.id,
    summary: `Cloned ${source.stockId} into ${stockId}`,
  });

  revalidatePath("/inventory");
  redirect(`/inventory/${clone.id}/edit?cloned=1`);
}

/* ------------------------------ DELETE -------------------------------- */

export async function deactivateVehicle(vehicleId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.INVENTORY_DELETE);

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, dealerId: user.dealerId },
    include: { _count: { select: { sales: true, bookings: true, leads: true } } },
  });
  if (!vehicle) return { status: "error" as const, message: "Vehicle not found" };

  // Business history is never destroyed — sold or transacted stock is archived instead.
  if (vehicle._count.sales > 0 || vehicle.status === "sold") {
    return {
      status: "error" as const,
      message: "Sold vehicles are kept permanently in sales history and cannot be deleted.",
    };
  }

  if (vehicle._count.leads > 0 || vehicle._count.bookings > 0) {
    await db.vehicle.update({ where: { id: vehicleId }, data: { status: "inactive" } });
    await audit({
      dealerId: user.dealerId,
      userId: user.id,
      action: "update",
      entity: "vehicle",
      entityId: vehicleId,
      summary: `${vehicle.stockId} deactivated (has linked leads)`,
    });
    revalidatePath("/inventory");
    return { status: "success" as const, message: "Vehicle deactivated and hidden from your website." };
  }

  await db.vehicle.delete({ where: { id: vehicleId } });
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "delete",
    entity: "vehicle",
    entityId: vehicleId,
    summary: `Deleted ${vehicle.stockId} ${vehicleTitle(vehicle)}`,
  });

  revalidatePath("/inventory");
  redirect("/inventory?deleted=1");
}
