import type { Metadata } from "next";
import { Ticket, TrendingDown, Users, IndianRupee } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { platformMrr } from "@/lib/coupons";
import { PageHeader, StatCard, Card } from "@/components/ui/primitives";
import { CouponManager, type CouponRow } from "@/components/admin/CouponManager";
import { formatPrice, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireSuperAdmin();

  const [coupons, plans, mrr] = await Promise.all([
    db.coupon.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        plan: { select: { name: true } },
        redemptions: {
          orderBy: { createdAt: "desc" },
          include: { dealer: { select: { id: true, name: true } } },
        },
      },
    }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    platformMrr(),
  ]);

  const rows: CouponRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    planId: c.planId,
    planName: c.plan?.name ?? null,
    durationMonths: c.durationMonths,
    maxRedemptions: c.maxRedemptions,
    redemptionCount: c.redemptionCount,
    validUntil: c.validUntil?.toISOString() ?? null,
    isActive: c.isActive,
    notes: c.notes,
    // Only discounts still in force cost us money each month.
    totalDiscountGiven: c.redemptions
      .filter((r) => r.status === "active")
      .reduce((s, r) => s + r.discountAmount, 0),
    redemptions: c.redemptions.map((r) => ({
      id: r.id,
      dealerId: r.dealer.id,
      dealerName: r.dealer.name,
      discountAmount: r.discountAmount,
      finalPrice: r.finalPrice,
      status: r.status,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  }));

  const liveCoupons = rows.filter((c) => c.isActive).length;
  const totalRedemptions = rows.reduce((s, c) => s + c.redemptionCount, 0);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Coupons"
        description="Discount what a dealership pays for their subscription."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Live coupons"
          value={liveCoupons}
          sub={`${rows.length} total`}
          tone="brand"
          icon={<Ticket className="size-4" />}
        />
        <StatCard
          label="Total redemptions"
          value={totalRedemptions}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Discount running"
          value={formatPrice(mrr.discount)}
          sub={`${mrr.activeDiscounts} dealer${mrr.activeDiscounts === 1 ? "" : "s"} per month`}
          tone={mrr.discount ? "warning" : "neutral"}
          icon={<TrendingDown className="size-4" />}
        />
        <StatCard
          label="Net MRR"
          value={formatPrice(mrr.net)}
          sub={
            mrr.gross
              ? `${pct(mrr.discount, mrr.gross)}% discounted from ${formatPrice(mrr.gross)}`
              : undefined
          }
          tone="success"
          icon={<IndianRupee className="size-4" />}
        />
      </div>

      <CouponManager
        coupons={rows}
        plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
      />

      <Card className="mt-6">
        <h2 className="text-[14px] font-semibold text-ink-900">How coupons behave</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-600">
          <li>
            <strong>One at a time.</strong> A dealership can hold one active discount. Applying a
            second is blocked until the first is removed, so discounts never stack by accident.
          </li>
          <li>
            <strong>Prices are snapshotted.</strong> The list price, discount and payable amount are
            stored on the redemption, so raising a plan price later never rewrites what a dealer was
            charged.
          </li>
          <li>
            <strong>Duration expires on its own.</strong> A 3-month coupon stops applying after 3
            months — checked whenever billing is read, so no scheduled job is needed.
          </li>
          <li>
            <strong>Pausing is safe.</strong> Deactivating a code stops new redemptions but leaves
            existing discounts running. Codes that have been redeemed cannot be deleted, only paused.
          </li>
          <li>
            <strong>Apply from a dealership.</strong> Open any dealer and use{" "}
            <em>Apply a coupon</em> in Account controls. The dealer sees the discount on their
            Settings screen.
          </li>
        </ul>
      </Card>
    </div>
  );
}
