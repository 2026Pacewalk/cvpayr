"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Star, ArrowRightLeft, Copy, Trash2, Handshake, CheckCircle2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet, ConfirmDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { Alert } from "@/components/ui/Toast";
import {
  changeVehicleStatus, toggleFeatured, transferVehicle, cloneVehicle, deactivateVehicle,
} from "@/app/actions/vehicles";
import { recordSale } from "@/app/actions/sales";
import { VEHICLE_STATUSES, VEHICLE_STATUS_META, type VehicleStatus } from "@/lib/constants";
import { cn, toDateInput } from "@/lib/utils";

export function VehicleStatusBar({
  vehicleId,
  stockId,
  title,
  status,
  isFeatured,
  branchId,
  branchName,
  branches,
  canEdit,
  canTransfer,
  canDelete,
  canCreate,
  canSell,
  sellingPrice,
}: {
  vehicleId: string;
  stockId: string;
  title: string;
  status: string;
  isFeatured: boolean;
  branchId: string;
  branchName: string;
  branches: { id: string; name: string; city: string }[];
  canEdit: boolean;
  canTransfer: boolean;
  canDelete: boolean;
  canCreate: boolean;
  canSell: boolean;
  sellingPrice?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const isSold = status === "sold";

  const setStatus = (next: string) =>
    startTransition(async () => {
      await changeVehicleStatus(vehicleId, next);
      toast.success(`Marked ${VEHICLE_STATUS_META[next as VehicleStatus].label.toLowerCase()}`);
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-ink-200 bg-white p-2.5">
        {canEdit && !isSold && (
          <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
            {VEHICLE_STATUSES.filter((s) => s !== "sold").map((s) => {
              const meta = VEHICLE_STATUS_META[s];
              const active = status === s;
              return (
                <button
                  key={s}
                  onClick={() => !active && setStatus(s)}
                  disabled={pending || active}
                  title={meta.help}
                  className={cn(
                    "shrink-0 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-ink-900 text-white"
                      : "border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {isSold && (
          <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-danger-50 px-3 py-1.5 text-[12.5px] font-medium text-danger-700">
            <CheckCircle2 className="size-3.5" />
            Sold — archived in sales history
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {canEdit && !isSold && (
            <Button
              variant="ghost"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await toggleFeatured(vehicleId);
                  if (res.status === "success") {
                    toast.success(res.isFeatured ? "Featured on your website" : "Removed from featured");
                    router.refresh();
                  }
                })
              }
            >
              <Star className={cn("size-4", isFeatured && "fill-warning-600 text-warning-600")} />
              {isFeatured ? "Unfeature" : "Feature"}
            </Button>
          )}

          {canTransfer && !isSold && branches.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="size-4" />
              Transfer
            </Button>
          )}

          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startTransition(async () => void cloneVehicle(vehicleId))}
            >
              <Copy className="size-4" />
              Duplicate
            </Button>
          )}

          {canSell && !isSold && (
            <Button size="sm" onClick={() => setSellOpen(true)}>
              <Handshake className="size-4" />
              Mark sold
            </Button>
          )}

          {canDelete && !isSold && (
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4 text-danger-600" />
            </Button>
          )}
        </div>
      </div>

      {/* Transfer */}
      <Sheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer to another branch"
        description={`${stockId} — currently at ${branchName}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!target}
              onClick={() =>
                startTransition(async () => {
                  const res = await transferVehicle(vehicleId, target, note);
                  if (res.status === "success") {
                    toast.success("Transferred", res.message);
                    setTransferOpen(false);
                    router.refresh();
                  } else {
                    toast.error(res.message ?? "Transfer failed");
                  }
                })
              }
            >
              Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Move to" required>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select a branch</option>
              {branches
                .filter((b) => b.id !== branchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Note" hint="Optional">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Sheet>

      {/* Sale */}
      <SellSheet
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        vehicleId={vehicleId}
        title={title}
        stockId={stockId}
        defaultPrice={sellingPrice}
        onDone={() => {
          setSellOpen(false);
          router.refresh();
        }}
      />

      {/* Delete */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        loading={pending}
        title="Remove this vehicle?"
        confirmLabel="Remove vehicle"
        message={
          <>
            <p>
              <strong>{stockId}</strong> — {title}
            </p>
            <p className="mt-2">
              If the vehicle has linked enquiries it will be deactivated and hidden from your
              website rather than deleted, so the history stays intact.
            </p>
            {error && (
              <div className="mt-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
          </>
        }
        onConfirm={() =>
          startTransition(async () => {
            const res = await deactivateVehicle(vehicleId);
            if (res?.status === "error") {
              setError(res.message);
            } else {
              toast.success(res?.message ?? "Vehicle removed");
              setDeleteOpen(false);
              router.refresh();
            }
          })
        }
      />
    </>
  );
}

function SellSheet({
  open,
  onClose,
  vehicleId,
  title,
  stockId,
  defaultPrice,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  title: string;
  stockId: string;
  defaultPrice?: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await recordSale({
        vehicleId,
        customerName: String(formData.get("customerName") ?? ""),
        customerPhone: String(formData.get("customerPhone") ?? ""),
        salePrice: Number(formData.get("salePrice") ?? 0),
        otherCharges: Number(formData.get("otherCharges") ?? 0),
        paymentMode: String(formData.get("paymentMode") ?? ""),
        financeProvider: String(formData.get("financeProvider") ?? ""),
        soldAt: String(formData.get("soldAt") ?? ""),
        note: String(formData.get("note") ?? ""),
      });
      if (res.status === "error") {
        setError(res.message);
      } else {
        toast.success("Sale recorded", res.message);
        onDone();
      }
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Record a sale" description={`${stockId} — ${title}`} size="md">
      <form action={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" required>
            <Input name="customerName" required placeholder="e.g. Jaspreet Sidhu" />
          </Field>
          <Field label="Mobile number" required hint="Used to match an existing customer">
            <Input name="customerPhone" required prefix="+91" inputMode="numeric" placeholder="98765 43210" />
          </Field>
          <Field label="Final sale price" required>
            <Input
              name="salePrice"
              type="number"
              required
              prefix="₹"
              defaultValue={defaultPrice}
              inputMode="numeric"
            />
          </Field>
          <Field label="Other charges" hint="RTO, insurance, handling">
            <Input name="otherCharges" type="number" prefix="₹" defaultValue={0} inputMode="numeric" />
          </Field>
          <Field label="Sale date">
            <Input name="soldAt" type="date" defaultValue={toDateInput(new Date())} />
          </Field>
          <Field label="Payment mode">
            <Select name="paymentMode" defaultValue="Full Payment">
              <option>Full Payment</option>
              <option>Finance</option>
              <option>Part Exchange</option>
              <option>Bank Transfer</option>
              <option>Cheque</option>
            </Select>
          </Field>
          <Field label="Finance provider" hint="If financed" className="sm:col-span-2">
            <Input name="financeProvider" placeholder="e.g. HDFC Bank" />
          </Field>
        </div>

        <Field label="Note">
          <Textarea name="note" rows={2} placeholder="Delivery scheduled for Saturday morning." />
        </Field>

        <div className="rounded-[10px] bg-info-50 p-3.5 text-[12.5px] leading-relaxed text-info-700">
          Recording a sale moves the vehicle to <strong>Sold</strong> and keeps it permanently in
          your sales history. Any other open enquiry on this car is closed as{" "}
          <em>Vehicle sold</em>.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record sale
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
