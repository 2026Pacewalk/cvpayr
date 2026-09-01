"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";
import { ROLE_TEMPLATES, ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { slugify, normalisePhone, addDays } from "@/lib/utils";
import { validateCoupon, redeemCoupon, describeCoupon } from "@/lib/coupons";
import { yearlyPrice, normaliseCycle } from "@/lib/billing";
import { notifyRecipients } from "@/server/events";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

/* ---------------------------- DEALER STATUS --------------------------- */

export async function setDealerStatus(dealerId: string, status: string) {
  await requireSuperAdmin();
  if (!["trial", "active", "suspended", "expired"].includes(status)) {
    return { status: "error" as const, message: "Unknown status" };
  }

  const dealer = await db.dealer.update({ where: { id: dealerId }, data: { status } });
  await db.subscription.updateMany({
    where: { dealerId },
    data: { status: status === "active" ? "active" : status },
  });

  revalidatePath("/admin/dealers");
  revalidatePath(`/admin/dealers/${dealerId}`);
  return {
    status: "success" as const,
    message:
      status === "suspended"
        ? `${dealer.name} suspended — their public showroom is now offline.`
        : `${dealer.name} is now ${status}.`,
  };
}

export async function changeDealerPlan(dealerId: string, planId: string) {
  await requireSuperAdmin();

  const [dealer, plan] = await Promise.all([
    db.dealer.findUnique({ where: { id: dealerId } }),
    db.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!dealer || !plan) return { status: "error" as const, message: "Not found" };

  await db.subscription.upsert({
    where: { dealerId },
    create: {
      dealerId,
      planId,
      status: dealer.status === "trial" ? "trial" : "active",
      currentPeriodEnd: addDays(new Date(), 30),
    },
    update: { planId, currentPeriodEnd: addDays(new Date(), 30) },
  });

  revalidatePath("/admin/dealers");
  revalidatePath(`/admin/dealers/${dealerId}`);
  return { status: "success" as const, message: `${dealer.name} moved to ${plan.name}.` };
}

export async function changeBillingCycle(dealerId: string, cycle: string) {
  await requireSuperAdmin();
  const next = normaliseCycle(cycle);

  const subscription = await db.subscription.findUnique({
    where: { dealerId },
    include: { plan: { select: { name: true, priceMonthly: true } } },
  });
  if (!subscription) return { status: "error" as const, message: "No subscription found" };

  await db.subscription.update({
    where: { dealerId },
    data: {
      billingCycle: next,
      currentPeriodEnd: addDays(new Date(), next === "yearly" ? 365 : 30),
    },
  });

  // A coupon was priced against the old cycle, so it no longer reflects the
  // invoice. Retire it rather than silently discounting the wrong amount.
  const active = await db.couponRedemption.findFirst({
    where: { dealerId, status: "active" },
    include: { coupon: { select: { id: true, code: true } } },
  });
  let couponNote = "";
  if (active) {
    await db.$transaction([
      db.couponRedemption.update({ where: { id: active.id }, data: { status: "revoked" } }),
      db.coupon.update({
        where: { id: active.coupon.id },
        data: { redemptionCount: { decrement: 1 } },
      }),
    ]);
    couponNote = ` ${active.coupon.code} was removed — re-apply it to price against the new cycle.`;
  }

  revalidatePath(`/admin/dealers/${dealerId}`);
  revalidatePath("/admin/plans");
  revalidatePath("/settings");
  return {
    status: "success" as const,
    message:
      next === "yearly"
        ? `Switched to yearly billing at ${yearlyPrice(subscription.plan.priceMonthly)} per year.${couponNote}`
        : `Switched to monthly billing.${couponNote}`,
  };
}

export async function extendTrial(dealerId: string, days: number) {
  await requireSuperAdmin();
  const subscription = await db.subscription.findUnique({ where: { dealerId } });
  if (!subscription) return { status: "error" as const, message: "No subscription found" };

  const base = subscription.trialEndsAt && subscription.trialEndsAt > new Date()
    ? subscription.trialEndsAt
    : new Date();

  await db.subscription.update({
    where: { dealerId },
    data: { trialEndsAt: addDays(base, days), status: "trial" },
  });
  await db.dealer.update({ where: { id: dealerId }, data: { status: "trial" } });

  revalidatePath(`/admin/dealers/${dealerId}`);
  return { status: "success" as const, message: `Trial extended by ${days} days.` };
}

/* --------------------------- DEALER ONBOARDING ------------------------ */

const dealerSchema = z.object({
  name: z.string().trim().min(2, "Dealership name is required"),
  slug: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email"),
  ownerName: z.string().trim().min(2, "Owner name is required"),
  ownerEmail: z.string().trim().email("Enter a valid owner email"),
  password: z.string().optional(),
  planId: z.string().min(1, "Choose a plan"),
  status: z.string().optional(),
});

/**
 * Onboards a new tenant: dealer record, subscription, the full role set, a first
 * branch and the owner account. Everything a dealership needs to sign in.
 */
export async function createDealer(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const parsed = dealerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  const d = parsed.data;
  const slug = slugify(d.slug || d.name);

  const [slugTaken, emailTaken] = await Promise.all([
    db.dealer.findUnique({ where: { slug } }),
    db.user.findUnique({ where: { email: d.ownerEmail.toLowerCase() } }),
  ]);
  if (slugTaken) {
    return {
      status: "error",
      message: `The URL /d/${slug} is already taken.`,
      fieldErrors: { slug: "Already in use" },
    };
  }
  if (emailTaken) {
    return {
      status: "error",
      message: "That owner email already has an account.",
      fieldErrors: { ownerEmail: "Already registered" },
    };
  }

  const status = d.status ?? "trial";

  const dealer = await db.dealer.create({
    data: {
      slug,
      name: d.name,
      city: d.city || null,
      state: d.state || null,
      phone: d.phone ? normalisePhone(d.phone) : null,
      whatsapp: d.phone ? normalisePhone(d.phone) : null,
      email: d.email,
      contactPerson: d.ownerName,
      status,
    },
  });

  await db.subscription.create({
    data: {
      dealerId: dealer.id,
      planId: d.planId,
      status: status === "active" ? "active" : "trial",
      trialEndsAt: status === "trial" ? addDays(new Date(), 14) : null,
      currentPeriodEnd: status === "active" ? addDays(new Date(), 30) : null,
    },
  });

  await db.websiteSettings.create({ data: { dealerId: dealer.id } });

  const roles: Record<string, string> = {};
  for (const template of ROLE_TEMPLATES) {
    const role = await db.role.create({
      data: {
        dealerId: dealer.id,
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
        permissions: JSON.stringify(
          template.key === "dealer_owner" ? ALL_PERMISSIONS : template.permissions,
        ),
      },
    });
    roles[template.key] = role.id;
  }

  await db.branch.create({
    data: {
      dealerId: dealer.id,
      code: "MAIN",
      name: `${d.name} — Main Showroom`,
      city: d.city || "—",
      state: d.state || null,
      phone: d.phone ? normalisePhone(d.phone) : null,
      sortOrder: 1,
    },
  });

  await db.user.create({
    data: {
      dealerId: dealer.id,
      roleId: roles.dealer_owner,
      name: d.ownerName,
      email: d.ownerEmail.toLowerCase(),
      phone: d.phone ? normalisePhone(d.phone) : null,
      designation: "Dealer Owner",
      passwordHash: await hashPassword(d.password?.trim() || "password123"),
    },
  });

  revalidatePath("/admin/dealers");
  redirect(`/admin/dealers/${dealer.id}?created=1`);
}

/* ------------------------------- PLANS -------------------------------- */

const planSchema = z.object({
  code: z.string().trim().min(2),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  priceMonthly: z.coerce.number().int().min(0),
  maxBranches: z.coerce.number().int(),
  maxUsers: z.coerce.number().int(),
  maxVehicles: z.coerce.number().int(),
  maxImagesPerVehicle: z.coerce.number().int().min(1),
  storageMb: z.coerce.number().int().min(0),
  isActive: z.string().optional(),
});

export async function savePlan(planId: string | null, formData: FormData) {
  await requireSuperAdmin();

  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { status: "error" as const, message: parsed.error.issues[0]?.message ?? "Invalid plan" };
  }

  const features = {
    crm: formData.get("f_crm") === "on",
    customDomain: formData.get("f_customDomain") === "on",
    advancedReports: formData.get("f_advancedReports") === "on",
    customBranding: formData.get("f_customBranding") === "on",
    apiAccess: formData.get("f_apiAccess") === "on",
    prioritySupport: formData.get("f_prioritySupport") === "on",
    bulkImport: formData.get("f_bulkImport") === "on",
  };

  const data = {
    ...parsed.data,
    description: parsed.data.description || null,
    isActive: parsed.data.isActive === "on",
    features: JSON.stringify(features),
    // Yearly is always derived from monthly so the two can never drift apart.
    priceYearly: yearlyPrice(parsed.data.priceMonthly),
  };

  if (planId) {
    await db.plan.update({ where: { id: planId }, data });
  } else {
    await db.plan.create({ data: { ...data, sortOrder: 99 } });
  }

  revalidatePath("/admin/plans");
  return { status: "success" as const, message: "Plan saved" };
}

/* ------------------------------ COUPONS ------------------------------- */

const couponSchema = z.object({
  code: z.string().trim().min(3, "Code must be at least 3 characters"),
  description: z.string().trim().optional(),
  discountType: z.enum(["percent", "flat"]),
  discountValue: z.coerce.number().int().min(1, "Enter a discount value"),
  planId: z.string().optional(),
  durationMonths: z.string().optional(),
  maxRedemptions: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().trim().optional(),
  isActive: z.string().optional(),
});

const optionalInt = (v?: string) => {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export async function saveCoupon(couponId: string | null, formData: FormData) {
  await requireSuperAdmin();

  const parsed = couponSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { status: "error" as const, message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const d = parsed.data;
  const code = d.code.toUpperCase().replace(/\s+/g, "");

  if (d.discountType === "percent" && d.discountValue > 100) {
    return { status: "error" as const, message: "A percentage discount cannot exceed 100%." };
  }

  const clash = await db.coupon.findUnique({ where: { code } });
  if (clash && clash.id !== couponId) {
    return { status: "error" as const, message: `The code ${code} is already in use.` };
  }

  const data = {
    code,
    description: d.description || null,
    discountType: d.discountType,
    discountValue: d.discountValue,
    planId: d.planId || null,
    durationMonths: optionalInt(d.durationMonths),
    maxRedemptions: optionalInt(d.maxRedemptions),
    validUntil: d.validUntil ? new Date(d.validUntil) : null,
    notes: d.notes || null,
    isActive: d.isActive === "on",
  };

  if (couponId) await db.coupon.update({ where: { id: couponId }, data });
  else await db.coupon.create({ data });

  revalidatePath("/admin/coupons");
  return { status: "success" as const, message: couponId ? "Coupon updated" : `Coupon ${code} created` };
}

export async function toggleCoupon(couponId: string) {
  await requireSuperAdmin();
  const coupon = await db.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) return { status: "error" as const, message: "Coupon not found" };

  await db.coupon.update({ where: { id: couponId }, data: { isActive: !coupon.isActive } });
  revalidatePath("/admin/coupons");
  return {
    status: "success" as const,
    message: coupon.isActive
      ? `${coupon.code} deactivated — existing discounts keep running.`
      : `${coupon.code} is live again.`,
  };
}

export async function deleteCoupon(couponId: string) {
  await requireSuperAdmin();
  const coupon = await db.coupon.findUnique({
    where: { id: couponId },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!coupon) return { status: "error" as const, message: "Coupon not found" };
  if (coupon._count.redemptions > 0) {
    return {
      status: "error" as const,
      message: `${coupon.code} has ${coupon._count.redemptions} redemption(s). Deactivate it instead so billing history stays intact.`,
    };
  }

  await db.coupon.delete({ where: { id: couponId } });
  revalidatePath("/admin/coupons");
  return { status: "success" as const, message: "Coupon deleted" };
}

/** Checks a code against a dealership without writing anything. */
export async function previewCouponForDealer(dealerId: string, code: string) {
  await requireSuperAdmin();
  const check = await validateCoupon(code, { dealerId });
  if (!check.ok) return { status: "error" as const, message: check.reason };
  return {
    status: "success" as const,
    listPrice: check.listPrice,
    discountAmount: check.discountAmount,
    finalPrice: check.finalPrice,
    code: check.coupon.code,
    summary: describeCoupon(check.coupon),
    cycle: check.cycle,
  };
}

export async function applyCouponToDealer(dealerId: string, code: string) {
  const admin = await requireSuperAdmin();
  const result = await redeemCoupon({ code, dealerId, appliedById: admin.id });
  if (!result.ok) return { status: "error" as const, message: result.reason };

  const dealer = await db.dealer.findUnique({ where: { id: dealerId }, select: { name: true } });
  await notifyRecipients(
    { dealerId, permissions: [PERMISSIONS.SETTINGS_VIEW] },
    {
      type: "system.notice",
      title: `Discount applied: ${result.coupon.code}`,
      body: `${describeCoupon(result.coupon)} on your subscription.`,
      link: "/settings",
      priority: "medium",
    },
  );

  revalidatePath(`/admin/dealers/${dealerId}`);
  revalidatePath("/admin/coupons");
  revalidatePath("/settings");
  return {
    status: "success" as const,
    message: `${result.coupon.code} applied to ${dealer?.name ?? "the dealership"}.`,
  };
}

export async function revokeRedemption(redemptionId: string) {
  await requireSuperAdmin();
  const redemption = await db.couponRedemption.findUnique({
    where: { id: redemptionId },
    include: { coupon: { select: { id: true, code: true } } },
  });
  if (!redemption) return { status: "error" as const, message: "Redemption not found" };

  await db.$transaction([
    db.couponRedemption.update({ where: { id: redemptionId }, data: { status: "revoked" } }),
    // Free the slot back up so the coupon can be reissued.
    db.coupon.update({
      where: { id: redemption.coupon.id },
      data: { redemptionCount: { decrement: 1 } },
    }),
  ]);

  revalidatePath(`/admin/dealers/${redemption.dealerId}`);
  revalidatePath("/admin/coupons");
  revalidatePath("/settings");
  return { status: "success" as const, message: `${redemption.coupon.code} removed. Full price resumes next cycle.` };
}

/* --------------------- PLATFORM NOTIFICATIONS ------------------------- */

/**
 * Marks every notice addressed to this super admin as read. Scoped by
 * `userId`, so it can only ever touch the caller's own rows.
 */
export async function markAllPlatformNotificationsRead() {
  const admin = await requireSuperAdmin();
  const result = await db.notification.updateMany({
    where: { userId: admin.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  return { status: "success" as const, count: result.count };
}
