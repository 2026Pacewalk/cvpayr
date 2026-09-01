import "server-only";
import { db } from "./db";
import { addDays } from "./utils";
import { cyclePrice, normaliseCycle, monthlyRunRate, type BillingCycle } from "./billing";

/**
 * Subscription coupons.
 *
 * A coupon reduces what a dealership pays CarVyapar.in. All pricing maths lives
 * here so the admin console, the dealer settings screen and the MRR figures can
 * never disagree about what someone is actually being charged.
 */

export const DISCOUNT_TYPES = [
  { value: "percent", label: "Percentage off" },
  { value: "flat", label: "Flat amount off" },
];

export type CouponInput = {
  discountType: string;
  discountValue: number;
};

/** Applies a coupon to a list price. Never returns a negative payable amount. */
export function computeDiscount(listPrice: number, coupon: CouponInput) {
  const raw =
    coupon.discountType === "percent"
      ? Math.round((listPrice * coupon.discountValue) / 100)
      : coupon.discountValue;

  const discountAmount = Math.max(0, Math.min(raw, listPrice));
  return { discountAmount, finalPrice: listPrice - discountAmount };
}

export function describeCoupon(coupon: CouponInput & { durationMonths?: number | null }) {
  const amount =
    coupon.discountType === "percent"
      ? `${coupon.discountValue}% off`
      : `₹${new Intl.NumberFormat("en-IN").format(coupon.discountValue)} off`;
  const duration = coupon.durationMonths
    ? `for ${coupon.durationMonths} month${coupon.durationMonths === 1 ? "" : "s"}`
    : "for the life of the subscription";
  return `${amount} ${duration}`;
}

export type CouponCheck =
  | { ok: false; reason: string }
  | {
      ok: true;
      coupon: {
        id: string;
        code: string;
        discountType: string;
        discountValue: number;
        durationMonths: number | null;
      };
      listPrice: number;
      discountAmount: number;
      finalPrice: number;
      cycle: BillingCycle;
      expiresAt: Date | null;
    };

/**
 * Validates a code against a specific dealership before anything is written.
 * Every rejection returns a reason a human can act on.
 */
export async function validateCoupon(
  rawCode: string,
  opts: { dealerId: string },
): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a coupon code." };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) return { ok: false, reason: `No coupon found with the code ${code}.` };
  if (!coupon.isActive) return { ok: false, reason: `${code} has been deactivated.` };

  const now = new Date();
  if (coupon.validFrom > now) {
    return { ok: false, reason: `${code} is not valid until ${coupon.validFrom.toDateString()}.` };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { ok: false, reason: `${code} expired on ${coupon.validUntil.toDateString()}.` };
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, reason: `${code} has reached its limit of ${coupon.maxRedemptions} redemptions.` };
  }

  const subscription = await db.subscription.findUnique({
    where: { dealerId: opts.dealerId },
    include: { plan: true },
  });
  if (!subscription) {
    return { ok: false, reason: "This dealership has no subscription to discount yet." };
  }
  if (coupon.planId && coupon.planId !== subscription.planId) {
    const restricted = await db.plan.findUnique({ where: { id: coupon.planId } });
    return { ok: false, reason: `${code} only applies to the ${restricted?.name ?? "restricted"} plan.` };
  }

  const already = await db.couponRedemption.findFirst({
    where: { couponId: coupon.id, dealerId: opts.dealerId },
  });
  if (already) {
    return { ok: false, reason: `This dealership has already used ${code}.` };
  }

  const activeOther = await db.couponRedemption.findFirst({
    where: { dealerId: opts.dealerId, status: "active" },
    include: { coupon: { select: { code: true } } },
  });
  if (activeOther) {
    return {
      ok: false,
      reason: `${activeOther.coupon.code} is already active on this account. Remove it before applying another.`,
    };
  }

  // Discounts apply to whatever the dealership is actually billed each cycle,
  // so a 25% coupon on a yearly plan discounts the yearly invoice.
  const cycle = normaliseCycle(subscription.billingCycle);
  const listPrice = cyclePrice(subscription.plan.priceMonthly, cycle);
  const { discountAmount, finalPrice } = computeDiscount(listPrice, coupon);

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      durationMonths: coupon.durationMonths,
    },
    listPrice,
    discountAmount,
    finalPrice,
    cycle,
    expiresAt: coupon.durationMonths ? addDays(now, coupon.durationMonths * 30) : null,
  };
}

/** Writes the redemption and bumps the coupon counter in one transaction. */
export async function redeemCoupon(input: {
  code: string;
  dealerId: string;
  appliedById?: string | null;
}) {
  const check = await validateCoupon(input.code, { dealerId: input.dealerId });
  if (!check.ok) return check;

  const subscription = await db.subscription.findUnique({
    where: { dealerId: input.dealerId },
    select: { planId: true },
  });
  if (!subscription) return { ok: false as const, reason: "No subscription found." };

  await db.$transaction([
    db.couponRedemption.create({
      data: {
        couponId: check.coupon.id,
        dealerId: input.dealerId,
        planId: subscription.planId,
        originalPrice: check.listPrice,
        discountAmount: check.discountAmount,
        finalPrice: check.finalPrice,
        appliedById: input.appliedById ?? null,
        expiresAt: check.expiresAt,
      },
    }),
    db.coupon.update({
      where: { id: check.coupon.id },
      data: { redemptionCount: { increment: 1 } },
    }),
  ]);

  return check;
}

export type ActiveDiscount = {
  redemptionId: string;
  code: string;
  description: string;
  discountAmount: number;
  finalPrice: number;
  originalPrice: number;
  expiresAt: Date | null;
};

/**
 * The discount currently in force for a dealership, or null.
 * Lazily retires a redemption whose duration has run out, so expiry needs no cron.
 */
export async function getActiveDiscount(dealerId: string): Promise<ActiveDiscount | null> {
  const redemption = await db.couponRedemption.findFirst({
    where: { dealerId, status: "active" },
    include: { coupon: true },
    orderBy: { createdAt: "desc" },
  });
  if (!redemption) return null;

  if (redemption.expiresAt && redemption.expiresAt < new Date()) {
    await db.couponRedemption.update({
      where: { id: redemption.id },
      data: { status: "expired" },
    });
    return null;
  }

  return {
    redemptionId: redemption.id,
    code: redemption.coupon.code,
    description: describeCoupon(redemption.coupon),
    discountAmount: redemption.discountAmount,
    finalPrice: redemption.finalPrice,
    originalPrice: redemption.originalPrice,
    expiresAt: redemption.expiresAt,
  };
}

/** List price, discount and what the dealer actually pays. */
export async function resolveBilling(dealerId: string) {
  const subscription = await db.subscription.findUnique({
    where: { dealerId },
    include: { plan: true },
  });
  if (!subscription) return null;

  const discount = await getActiveDiscount(dealerId);
  const cycle = normaliseCycle(subscription.billingCycle);
  const listPrice = cyclePrice(subscription.plan.priceMonthly, cycle);

  return {
    planName: subscription.plan.name,
    cycle,
    priceMonthly: subscription.plan.priceMonthly,
    listPrice,
    discount,
    payable: discount ? discount.finalPrice : listPrice,
  };
}

/**
 * Net monthly recurring revenue across the platform — list prices minus every
 * active discount. Expired redemptions are filtered out in the same pass.
 */
export async function platformMrr() {
  const subscriptions = await db.subscription.findMany({
    where: { status: { in: ["active", "trial"] } },
    include: { plan: { select: { priceMonthly: true } } },
  });

  const active = await db.couponRedemption.findMany({
    where: { status: "active" },
    select: { dealerId: true, discountAmount: true, expiresAt: true },
  });

  const now = new Date();
  const discountByDealer = new Map(
    active
      .filter((r) => !r.expiresAt || r.expiresAt >= now)
      .map((r) => [r.dealerId, r.discountAmount]),
  );

  // Everything is expressed as a monthly run rate so monthly and yearly
  // subscriptions can be added together honestly.
  const gross = subscriptions.reduce(
    (s, sub) => s + monthlyRunRate(sub.plan.priceMonthly, normaliseCycle(sub.billingCycle)),
    0,
  );
  const discounted = subscriptions.reduce((s, sub) => {
    const amount = discountByDealer.get(sub.dealerId) ?? 0;
    // A discount on a yearly invoice is spread across the twelve months it covers.
    return s + (normaliseCycle(sub.billingCycle) === "yearly" ? Math.round(amount / 12) : amount);
  }, 0);

  return { gross, discount: discounted, net: gross - discounted, activeDiscounts: discountByDealer.size };
}
