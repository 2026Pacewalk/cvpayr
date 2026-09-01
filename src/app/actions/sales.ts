"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { audit, notify, notifyRecipients } from "@/server/events";
import { moveLeadStage, setVehicleStatus, upsertCustomer } from "@/server/leads";
import { vehicleTitle, formatPrice } from "@/lib/utils";

async function nextRef(dealerId: string, prefix: "BK" | "SL") {
  const count =
    prefix === "BK"
      ? await db.booking.count({ where: { dealerId } })
      : await db.sale.count({ where: { dealerId } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

/* ------------------------------ BOOKING ------------------------------- */

export type BookingInput = {
  vehicleId: string;
  leadId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  bookingAmount: number;
  agreedPrice: number;
  paymentMode?: string;
  paymentStatus?: string;
  note?: string;
  salesExecutiveId?: string | null;
};

/**
 * Records a booking and moves the vehicle to `booked`.
 * This is the step where a lead becomes a commitment, so it also advances the
 * pipeline and notifies the team.
 */
export async function createBooking(input: BookingInput) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SALES_MANAGE);

  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: user.dealerId },
  });
  if (!vehicle) return { status: "error" as const, message: "Vehicle not found" };
  if (vehicle.status === "sold") {
    return { status: "error" as const, message: "This vehicle has already been sold." };
  }

  let customerId = input.customerId ?? null;
  if (!customerId) {
    if (!input.customerName || !input.customerPhone) {
      return { status: "error" as const, message: "Customer name and mobile number are required." };
    }
    const { customer } = await upsertCustomer({
      dealerId: user.dealerId,
      name: input.customerName,
      phone: input.customerPhone,
    });
    customerId = customer.id;
  }

  const reference = await nextRef(user.dealerId, "BK");

  const booking = await db.booking.create({
    data: {
      dealerId: user.dealerId,
      reference,
      leadId: input.leadId ?? null,
      customerId,
      vehicleId: vehicle.id,
      branchId: vehicle.branchId,
      salesExecutiveId: input.salesExecutiveId ?? user.id,
      bookingAmount: input.bookingAmount,
      agreedPrice: input.agreedPrice,
      paymentMode: input.paymentMode ?? null,
      paymentStatus: input.paymentStatus ?? "partial",
      note: input.note ?? null,
    },
    include: { customer: true },
  });

  await setVehicleStatus(user.dealerId, vehicle.id, "booked", user.id);

  if (input.leadId) {
    await moveLeadStage({
      dealerId: user.dealerId,
      leadId: input.leadId,
      stage: "booked",
      userId: user.id,
    });
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId: input.leadId,
        userId: user.id,
        type: "booking",
        title: `Booking ${reference} created`,
        body: `Token ${input.bookingAmount} received against an agreed price of ${input.agreedPrice}.`,
      },
    });
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "booking",
    entityId: booking.id,
    summary: `${reference}: ${booking.customer.name} booked ${vehicle.stockId}`,
  });

  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.SALES_VIEW],
      branchId: vehicle.branchId,
      includeUserIds: [booking.salesExecutiveId],
      excludeUserIds: [user.id],
    },
    {
      type: "booking.created",
      title: `${booking.customer.name} booked ${vehicle.stockId}`,
      body: `${vehicleTitle(vehicle)} · token ${formatPrice(booking.bookingAmount)} of ${formatPrice(booking.agreedPrice)}`,
      link: "/sales",
      actorId: user.id,
      entityType: "booking",
      entityId: booking.id,
    },
  );

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${vehicle.id}`);
  return { status: "success" as const, message: `Booking ${reference} recorded`, bookingId: booking.id };
}

export async function cancelBooking(bookingId: string, reason?: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SALES_MANAGE);

  const booking = await db.booking.findFirst({
    where: { id: bookingId, dealerId: user.dealerId },
    include: { vehicle: true },
  });
  if (!booking) return { status: "error" as const, message: "Booking not found" };

  await db.booking.update({
    where: { id: bookingId },
    data: { status: "cancelled", note: reason ?? booking.note },
  });

  if (booking.vehicle.status === "booked") {
    await setVehicleStatus(user.dealerId, booking.vehicleId, "available", user.id);
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "booking",
    entityId: bookingId,
    summary: `${booking.reference} cancelled${reason ? `: ${reason}` : ""}`,
  });

  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.SALES_VIEW],
      branchId: booking.branchId,
      includeUserIds: [booking.salesExecutiveId],
      excludeUserIds: [user.id],
    },
    {
      type: "booking.cancelled",
      title: `Booking ${booking.reference} cancelled`,
      body: `${vehicleTitle(booking.vehicle)} is back in stock${reason ? ` — ${reason}` : ""}.`,
      link: "/sales",
      actorId: user.id,
      entityType: "booking",
      entityId: booking.id,
    },
  );

  revalidatePath("/sales");
  return { status: "success" as const, message: "Booking cancelled and vehicle released" };
}

/* -------------------------------- SALE -------------------------------- */

export type SaleInput = {
  vehicleId: string;
  bookingId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  salePrice: number;
  otherCharges?: number;
  paymentMode?: string;
  financeProvider?: string;
  salesExecutiveId?: string | null;
  soldAt?: string;
  note?: string;
};

/**
 * Closes the deal: writes the sale with a snapshot of cost, flips the vehicle to
 * `sold` (never deleting it), and marks the lead won.
 */
export async function recordSale(input: SaleInput) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SALES_MANAGE);

  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: user.dealerId },
  });
  if (!vehicle) return { status: "error" as const, message: "Vehicle not found" };
  if (vehicle.status === "sold") {
    return { status: "error" as const, message: "This vehicle is already marked sold." };
  }

  let customerId = input.customerId ?? null;
  if (!customerId) {
    if (!input.customerName || !input.customerPhone) {
      return { status: "error" as const, message: "Customer name and mobile number are required." };
    }
    const { customer } = await upsertCustomer({
      dealerId: user.dealerId,
      name: input.customerName,
      phone: input.customerPhone,
    });
    customerId = customer.id;
  }

  const reference = await nextRef(user.dealerId, "SL");
  const otherCharges = input.otherCharges ?? 0;
  const purchasePrice = vehicle.purchasePrice ?? 0;
  const refurbCost = vehicle.refurbishmentCost ?? 0;
  const grossProfit = input.salePrice - purchasePrice - refurbCost - otherCharges;

  const sale = await db.sale.create({
    data: {
      dealerId: user.dealerId,
      reference,
      bookingId: input.bookingId ?? null,
      leadId: input.leadId ?? null,
      customerId,
      vehicleId: vehicle.id,
      branchId: vehicle.branchId,
      salesExecutiveId: input.salesExecutiveId ?? user.id,
      salePrice: input.salePrice,
      // Cost is snapshotted so later edits to the vehicle never rewrite history.
      purchasePrice,
      refurbCost,
      otherCharges,
      grossProfit,
      paymentMode: input.paymentMode ?? null,
      financeProvider: input.financeProvider ?? null,
      note: input.note ?? null,
      soldAt: input.soldAt ? new Date(input.soldAt) : new Date(),
    },
    include: { customer: true },
  });

  if (input.bookingId) {
    await db.booking.update({ where: { id: input.bookingId }, data: { status: "converted", paymentStatus: "paid" } });
  }

  await setVehicleStatus(user.dealerId, vehicle.id, "sold", user.id);

  if (input.leadId) {
    await moveLeadStage({
      dealerId: user.dealerId,
      leadId: input.leadId,
      stage: "won",
      userId: user.id,
    });
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId: input.leadId,
        userId: user.id,
        type: "sale",
        title: `Sale ${reference} completed`,
        body: `${vehicleTitle(vehicle)} sold for ${input.salePrice}.`,
      },
    });
    // Any other open lead on this car can no longer convert.
    const others = await db.lead.findMany({
      where: {
        dealerId: user.dealerId,
        vehicleId: vehicle.id,
        id: { not: input.leadId },
        stage: { notIn: ["won", "lost", "not_interested"] },
      },
      select: { id: true },
    });
    for (const other of others) {
      await moveLeadStage({
        dealerId: user.dealerId,
        leadId: other.id,
        stage: "lost",
        userId: user.id,
        lostReason: "Vehicle sold",
      });
    }
  }

  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.SALES_VIEW],
      branchId: vehicle.branchId,
      excludeUserIds: [user.id],
    },
    {
      type: "vehicle.sold",
      title: `${vehicle.stockId} sold`,
      body: `${vehicleTitle(vehicle)} to ${sale.customer.name}`,
      link: "/sales",
      actorId: user.id,
      entityType: "sale",
      entityId: sale.id,
    },
  );

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "sale",
    entityId: sale.id,
    summary: `${reference}: ${vehicle.stockId} sold to ${sale.customer.name}`,
  });

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath(`/inventory/${vehicle.id}`);
  return { status: "success" as const, message: `Sale ${reference} recorded`, saleId: sale.id };
}
