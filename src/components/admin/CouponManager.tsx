"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ticket, Plus, Pencil, Power, Trash2, Copy, Check, Users, AlertTriangle,
} from "lucide-react";
import { Card, Badge, EmptyState, ProgressBar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Sheet, ConfirmDialog } from "@/components/ui/Overlay";
import { Field, Input, Textarea, Select, Switch, FormGrid } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { saveCoupon, toggleCoupon, deleteCoupon, revokeRedemption } from "@/app/actions/admin";
import { formatPrice, formatDate, toDateInput, cn, pct } from "@/lib/utils";

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  planId: string | null;
  planName: string | null;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validUntil: string | null;
  isActive: boolean;
  notes: string | null;
  totalDiscountGiven: number;
  redemptions: {
    id: string;
    dealerId: string;
    dealerName: string;
    discountAmount: number;
    finalPrice: number;
    status: string;
    expiresAt: string | null;
    createdAt: string;
  }[];
};

function discountLabel(c: { discountType: string; discountValue: number }) {
  return c.discountType === "percent" ? `${c.discountValue}% off` : `${formatPrice(c.discountValue)} off`;
}

export function CouponManager({
  coupons,
  plans,
}: {
  coupons: CouponRow[];
  plans: { id: string; name: string; priceMonthly: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<CouponRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<CouponRow | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Done");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not complete");
      }
    });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success(`${code} copied`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Create coupon
        </Button>
      </div>

      {coupons.length ? (
        <div className="space-y-3">
          {coupons.map((c) => {
            const exhausted =
              c.maxRedemptions != null && c.redemptionCount >= c.maxRedemptions;
            const expired = c.validUntil && new Date(c.validUntil) < new Date();
            const live = c.isActive && !exhausted && !expired;
            const activeRedemptions = c.redemptions.filter((r) => r.status === "active");

            return (
              <Card key={c.id} padded={false} className={live ? "" : "opacity-80"}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => copy(c.code)}
                          className="group inline-flex items-center gap-1.5 rounded-[8px] bg-ink-900 px-2.5 py-1 font-mono text-[13px] font-semibold tracking-wide text-white"
                          title="Copy code"
                        >
                          {c.code}
                          {copied === c.code ? (
                            <Check className="size-3.5 text-success-400" />
                          ) : (
                            <Copy className="size-3.5 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                        <Badge tone="brand">{discountLabel(c)}</Badge>
                        {live ? (
                          <Badge tone="success" size="sm" dot>Live</Badge>
                        ) : expired ? (
                          <Badge tone="danger" size="sm" dot>Expired</Badge>
                        ) : exhausted ? (
                          <Badge tone="warning" size="sm" dot>Fully redeemed</Badge>
                        ) : (
                          <Badge tone="neutral" size="sm" dot>Paused</Badge>
                        )}
                      </div>
                      {c.description && (
                        <p className="mt-2 text-[13px] text-ink-600">{c.description}</p>
                      )}
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-400">
                        <span>
                          {c.durationMonths
                            ? `Runs ${c.durationMonths} month${c.durationMonths === 1 ? "" : "s"}`
                            : "Runs for the life of the subscription"}
                        </span>
                        <span>· {c.planName ? `${c.planName} plan only` : "Any plan"}</span>
                        {c.validUntil && <span>· Valid till {formatDate(c.validUntil)}</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        aria-label={`Edit ${c.code}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => run(() => toggleCoupon(c.id))}
                        disabled={pending}
                        aria-label={c.isActive ? `Pause ${c.code}` : `Activate ${c.code}`}
                        title={c.isActive ? "Pause" : "Activate"}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-[8px] text-ink-400",
                          c.isActive ? "hover:bg-warning-50 hover:text-warning-600" : "hover:bg-success-50 hover:text-success-600",
                        )}
                      >
                        <Power className="size-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        aria-label={`Delete ${c.code}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-3">
                    <div>
                      <p className="field-label">Redeemed</p>
                      <p className="mt-1 text-[15px] font-semibold text-ink-950 tabular-nums">
                        {c.redemptionCount}
                        {c.maxRedemptions != null && (
                          <span className="text-[12px] font-normal text-ink-400"> / {c.maxRedemptions}</span>
                        )}
                      </p>
                      {c.maxRedemptions != null && (
                        <div className="mt-2">
                          <ProgressBar
                            value={pct(c.redemptionCount, c.maxRedemptions)}
                            height="h-1.5"
                            tone={exhausted ? "danger" : "brand"}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="field-label">Currently discounting</p>
                      <p className="mt-1 text-[15px] font-semibold text-ink-950 tabular-nums">
                        {activeRedemptions.length} dealer{activeRedemptions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <p className="field-label">Revenue given up</p>
                      <p className="mt-1 text-[15px] font-semibold text-warning-700 tabular-nums">
                        {formatPrice(c.totalDiscountGiven)}
                      </p>
                    </div>
                  </div>

                  {c.redemptions.length > 0 && (
                    <button
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
                    >
                      <Users className="size-3.5" />
                      {expanded === c.id ? "Hide" : "Show"} {c.redemptions.length} redemption
                      {c.redemptions.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>

                {expanded === c.id && (
                  <ul className="divide-y divide-ink-100 border-t border-ink-100">
                    {c.redemptions.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/dealers/${r.dealerId}`}
                            className="text-[13.5px] font-medium text-ink-900 hover:text-brand-700"
                          >
                            {r.dealerName}
                          </Link>
                          <p className="mt-0.5 text-[11.5px] text-ink-400">
                            Applied {formatDate(r.createdAt)}
                            {r.expiresAt && ` · ends ${formatDate(r.expiresAt)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[13px] font-semibold text-ink-900 tabular-nums">
                              {formatPrice(r.finalPrice)} <span className="text-[11px] font-normal text-ink-400">per cycle</span>
                            </p>
                            <p className="text-[11px] text-warning-700 tabular-nums">
                              −{formatPrice(r.discountAmount)}
                            </p>
                          </div>
                          <Badge
                            tone={r.status === "active" ? "success" : r.status === "revoked" ? "danger" : "neutral"}
                            size="sm"
                          >
                            {r.status}
                          </Badge>
                          {r.status === "active" && (
                            <Button
                              size="xs"
                              variant="outline"
                              loading={pending}
                              onClick={() => run(() => revokeRedemption(r.id))}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Ticket className="size-6" />}
          title="No coupons yet"
          description="Create a code to discount what a dealership pays — useful for launch offers, win-backs and referral deals."
          action={<Button onClick={() => setEditing("new")}>Create your first coupon</Button>}
        />
      )}

      {editing && (
        <CouponSheet
          coupon={editing === "new" ? null : editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        loading={pending}
        title="Delete this coupon?"
        confirmLabel="Delete coupon"
        message={
          deleting
            ? deleting.redemptionCount > 0
              ? `${deleting.code} has already been redeemed ${deleting.redemptionCount} time(s), so it cannot be deleted. Pause it instead — existing discounts keep running and billing history stays intact.`
              : `${deleting.code} has never been redeemed and will be removed permanently.`
            : ""
        }
        onConfirm={() => deleting && run(() => deleteCoupon(deleting.id))}
      />
    </>
  );
}

function CouponSheet({
  coupon,
  plans,
  onClose,
  onSaved,
}: {
  coupon: CouponRow | null;
  plans: { id: string; name: string; priceMonthly: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [type, setType] = React.useState(coupon?.discountType ?? "percent");
  const [value, setValue] = React.useState(coupon?.discountValue ?? 20);
  const [planId, setPlanId] = React.useState(coupon?.planId ?? "");

  // Live preview against a real plan price, so the operator sees the effect.
  const previewPlan = plans.find((p) => p.id === planId) ?? plans[1] ?? plans[0];
  const listPrice = previewPlan?.priceMonthly ?? 0;
  const rawDiscount = type === "percent" ? Math.round((listPrice * value) / 100) : value;
  const discount = Math.max(0, Math.min(rawDiscount, listPrice));
  const payable = listPrice - discount;

  return (
    <Sheet
      open
      onClose={onClose}
      title={coupon ? `Edit ${coupon.code}` : "Create a coupon"}
      description="Discounts what a dealership pays CarVyapar.in each month."
      size="lg"
    >
      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const res = await saveCoupon(coupon?.id ?? null, fd);
            if (res.status === "success") {
              toast.success(res.message ?? "Saved");
              onSaved();
            } else {
              setError(res.message ?? "Could not save");
            }
          });
        }}
        className="space-y-5"
      >
        {error && <Alert tone="error">{error}</Alert>}

        <FormGrid columns={2}>
          <Field label="Coupon code" required hint="Uppercase, no spaces — this is what dealers quote">
            <Input
              name="code"
              required
              defaultValue={coupon?.code}
              placeholder="DIWALI25"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Internal description">
            <Input
              name="description"
              defaultValue={coupon?.description ?? ""}
              placeholder="Diwali 2026 launch offer"
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field label="Discount type" required>
            <Select name="discountType" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percent">Percentage off</option>
              <option value="flat">Flat amount off</option>
            </Select>
          </Field>
          <Field
            label={type === "percent" ? "Percentage" : "Amount off"}
            required
            hint={type === "percent" ? "1 to 100" : "In rupees, per month"}
          >
            <Input
              name="discountValue"
              type="number"
              required
              min={1}
              max={type === "percent" ? 100 : undefined}
              prefix={type === "flat" ? "₹" : undefined}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </Field>
        </FormGrid>

        {/* Preview */}
        {previewPlan && (
          <div className="rounded-[12px] border border-brand-200 bg-brand-50/50 p-4">
            <p className="field-label mb-2.5 text-brand-700">
              Effect on the {previewPlan.name} plan
            </p>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-[11.5px] text-ink-500">List price</p>
                <p className="text-[15px] font-semibold text-ink-500 line-through tabular-nums">
                  {formatPrice(listPrice)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-ink-500">Discount</p>
                <p className="text-[15px] font-semibold text-warning-700 tabular-nums">
                  −{formatPrice(discount)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-ink-500">Dealer pays</p>
                <p className="font-display text-[20px] font-semibold text-ink-950 tabular-nums">
                  {formatPrice(payable)}
                  <span className="text-[12px] font-normal text-ink-400"> /month</span>
                </p>
              </div>
            </div>
            {discount === listPrice && listPrice > 0 && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-warning-700">
                <AlertTriangle className="size-3.5" />
                This makes the plan completely free.
              </p>
            )}
          </div>
        )}

        <FormGrid columns={2}>
          <Field label="Restrict to a plan" hint="Leave as Any plan for a general offer">
            <Select name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Any plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Discount runs for"
            hint="Leave blank to discount for as long as they stay subscribed"
          >
            <Input
              name="durationMonths"
              type="number"
              min={1}
              defaultValue={coupon?.durationMonths ?? ""}
              placeholder="e.g. 3 months"
            />
          </Field>
          <Field label="Maximum redemptions" hint="Leave blank for unlimited">
            <Input
              name="maxRedemptions"
              type="number"
              min={1}
              defaultValue={coupon?.maxRedemptions ?? ""}
              placeholder="e.g. 50"
            />
          </Field>
          <Field label="Code valid until" hint="After this date the code stops working">
            <Input
              name="validUntil"
              type="date"
              defaultValue={coupon?.validUntil ? toDateInput(coupon.validUntil) : ""}
            />
          </Field>
        </FormGrid>

        <Field label="Internal notes" hint="Never shown to dealers">
          <Textarea
            name="notes"
            rows={2}
            defaultValue={coupon?.notes ?? ""}
            placeholder="Approved by finance. Cap at 50 redemptions."
          />
        </Field>

        <div className="border-t border-ink-100 pt-4">
          <Switch
            name="isActive"
            defaultChecked={coupon?.isActive ?? true}
            label="Coupon is live"
            description="Pausing stops new redemptions. Discounts already applied keep running."
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>
            {coupon ? "Save coupon" : "Create coupon"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
