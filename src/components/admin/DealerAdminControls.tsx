"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, CalendarPlus, Ticket, X, Loader2 } from "lucide-react";
import { Card, CardHeader, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { useToast, Alert } from "@/components/ui/Toast";
import {
  setDealerStatus, changeDealerPlan, extendTrial, changeBillingCycle,
  previewCouponForDealer, applyCouponToDealer, revokeRedemption,
} from "@/app/actions/admin";
import { BILLING_CYCLES, cycleShortLabel, yearlyPrice, yearlySaving, YEARLY_DISCOUNT_PERCENT, type BillingCycle } from "@/lib/billing";
import { DEALER_STATUSES } from "@/lib/constants";
import { formatPrice, formatDate, cn } from "@/lib/utils";

export type ActiveDiscountView = {
  redemptionId: string;
  code: string;
  description: string;
  discountAmount: number;
  finalPrice: number;
  originalPrice: number;
  expiresAt: string | null;
} | null;

/** Platform-side controls. Suspending a dealer takes their public site offline. */
export function DealerAdminControls({
  dealerId,
  dealerName,
  status,
  currentPlanId,
  plans,
  discount,
  billingCycle,
  priceMonthly,
}: {
  dealerId: string;
  dealerName: string;
  status: string;
  currentPlanId: string | null;
  plans: { id: string; name: string; priceMonthly: number }[];
  discount: ActiveDiscountView;
  billingCycle: BillingCycle;
  priceMonthly: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmSuspend, setConfirmSuspend] = React.useState(false);

  const apply = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Updated");
        setConfirmSuspend(false);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not update");
      }
    });

  return (
    <Card>
      <CardHeader title="Account controls" icon={<ShieldAlert className="size-4" />} />

      <div className="mt-4 space-y-4">
        <div>
          <p className="field-label mb-2">Account status</p>
          <div className="grid grid-cols-2 gap-2">
            {DEALER_STATUSES.map((s) => {
              const active = status === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() =>
                    s.value === "suspended"
                      ? setConfirmSuspend(true)
                      : apply(() => setDealerStatus(dealerId, s.value))
                  }
                  disabled={active || pending}
                  className={cn(
                    "rounded-[9px] border px-3 py-2 text-[12.5px] font-medium transition-colors",
                    active
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
            Suspended and expired accounts stop serving their public showroom immediately. Staff
            can still sign in to the CRM.
          </p>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <Field label="Subscription plan">
            <Select
              defaultValue={currentPlanId ?? ""}
              disabled={pending}
              onChange={(e) => {
                if (e.target.value && e.target.value !== currentPlanId) {
                  apply(() => changeDealerPlan(dealerId, e.target.value));
                }
              }}
            >
              <option value="">No plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p.priceMonthly)}/mo
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <p className="field-label mb-2">Billing cycle</p>
          <div className="grid grid-cols-2 gap-2">
            {BILLING_CYCLES.map((c) => {
              const active = billingCycle === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => !active && apply(() => changeBillingCycle(dealerId, c.value))}
                  disabled={active || pending}
                  className={cn(
                    "rounded-[9px] border px-3 py-2 text-[12.5px] font-medium transition-colors",
                    active
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50",
                  )}
                >
                  {c.label}
                  {c.value === "yearly" && (
                    <span className={cn("ml-1.5 text-[10.5px]", active ? "text-white/60" : "text-success-700")}>
                      −{YEARLY_DISCOUNT_PERCENT}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
            {billingCycle === "yearly"
              ? `Billed ${formatPrice(yearlyPrice(priceMonthly))} per year — saving ${formatPrice(yearlySaving(priceMonthly))} against monthly.`
              : `Switching to yearly bills ${formatPrice(yearlyPrice(priceMonthly))} and saves ${formatPrice(yearlySaving(priceMonthly))} a year.`}
          </p>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <p className="field-label mb-2">Subscription discount</p>
          <CouponControl
            dealerId={dealerId}
            discount={discount}
            cycle={billingCycle}
            onDone={() => router.refresh()}
          />
        </div>

        <div className="border-t border-ink-100 pt-4">
          <p className="field-label mb-2">Extend trial</p>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((days) => (
              <Button
                key={days}
                variant="outline"
                size="sm"
                loading={pending}
                onClick={() => apply(() => extendTrial(dealerId, days))}
              >
                <CalendarPlus className="size-3.5" />
                +{days} days
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        loading={pending}
        title="Suspend this dealership?"
        confirmLabel="Suspend account"
        message={
          <>
            <p>
              <strong>{dealerName}</strong> will have their public showroom taken offline
              immediately. Customers visiting the URL will see a not-found page.
            </p>
            <p className="mt-2">Their data is untouched and the account can be reactivated at any time.</p>
          </>
        }
        onConfirm={() => apply(() => setDealerStatus(dealerId, "suspended"))}
      />
    </Card>
  );
}

/**
 * Apply or remove a subscription coupon.
 * The code is validated server-side before anything is written, so the operator
 * sees the exact effect on price before committing.
 */
function CouponControl({
  dealerId,
  discount,
  cycle,
  onDone,
}: {
  dealerId: string;
  discount: ActiveDiscountView;
  cycle: BillingCycle;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [code, setCode] = React.useState("");
  const [preview, setPreview] = React.useState<{
    code: string;
    summary: string;
    listPrice: number;
    discountAmount: number;
    finalPrice: number;
    cycle: BillingCycle;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (discount) {
    return (
      <div className="rounded-[10px] border border-success-100 bg-success-50/60 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] bg-ink-900 px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
                {discount.code}
              </span>
              <Badge tone="success" size="sm" dot>Active</Badge>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-600">{discount.description}</p>
            <p className="mt-1.5 text-[13px] text-ink-700">
              <span className="text-ink-400 line-through">{formatPrice(discount.originalPrice)}</span>{" "}
              <span className="font-semibold text-ink-950">{formatPrice(discount.finalPrice)}</span>
              <span className="text-[11.5px] text-ink-400"> {cycleShortLabel(cycle)}</span>
            </p>
            {discount.expiresAt && (
              <p className="mt-1 text-[11.5px] text-ink-400">
                Ends {formatDate(discount.expiresAt)}
              </p>
            )}
          </div>
          <Button
            size="xs"
            variant="outline"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await revokeRedemption(discount.redemptionId);
                if (res.status === "success") {
                  toast.success(res.message ?? "Removed");
                  onDone();
                } else {
                  toast.error(res.message ?? "Could not remove");
                }
              })
            }
          >
            <X className="size-3.5" />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setPreview(null);
            setError(null);
          }}
          placeholder="DIWALI25"
          aria-label="Coupon code"
          className="font-mono uppercase"
        />
        <Button
          variant="outline"
          disabled={!code.trim() || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await previewCouponForDealer(dealerId, code);
              if (res.status === "success") {
                setPreview({
                  code: res.code,
                  summary: res.summary,
                  listPrice: res.listPrice,
                  discountAmount: res.discountAmount,
                  finalPrice: res.finalPrice,
                  cycle: res.cycle,
                });
              } else {
                setPreview(null);
                setError(res.message);
              }
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Ticket className="size-4" />}
          Check
        </Button>
      </div>

      {error && (
        <div className="mt-2.5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {preview && (
        <div className="mt-2.5 rounded-[10px] border border-brand-200 bg-brand-50/60 p-3.5">
          <p className="text-[12.5px] text-ink-600">{preview.summary}</p>
          <p className="mt-1.5 text-[13px] text-ink-700">
            <span className="text-ink-400 line-through">{formatPrice(preview.listPrice)}</span>{" "}
            <span className="font-semibold text-ink-950">{formatPrice(preview.finalPrice)}</span>
            <span className="text-[11.5px] text-ink-400"> {cycleShortLabel(preview.cycle)}</span>
            <span className="ml-2 text-[11.5px] text-warning-700">
              −{formatPrice(preview.discountAmount)}
            </span>
          </p>
          <Button
            size="sm"
            className="mt-3"
            fullWidth
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await applyCouponToDealer(dealerId, preview.code);
                if (res.status === "success") {
                  toast.success(res.message ?? "Applied");
                  setPreview(null);
                  setCode("");
                  onDone();
                } else {
                  setError(res.message);
                }
              })
            }
          >
            Apply {preview.code}
          </Button>
        </div>
      )}

      {!preview && !error && (
        <p className="mt-2 text-[11.5px] text-ink-400">
          Enter a code to see the exact effect on this dealership before applying it.
        </p>
      )}
    </div>
  );
}
