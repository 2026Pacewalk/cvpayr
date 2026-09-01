"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Handshake, XCircle, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { recordSale, cancelBooking } from "@/app/actions/sales";
import { extendBooking } from "@/app/actions/attention";
import { toDateInput } from "@/lib/utils";

/** Convert a booking into a completed sale, or release the vehicle. */
export function BookingActions({
  bookingId,
  vehicleId,
  leadId,
  customerName,
  customerPhone,
  agreedPrice,
  vehicleLabel,
}: {
  bookingId: string;
  vehicleId: string;
  leadId: string | null;
  customerName: string;
  customerPhone: string;
  agreedPrice: number;
  vehicleLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [sheet, setSheet] = React.useState<null | "complete" | "cancel">(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <Button size="sm" variant="outline" onClick={() => setSheet("cancel")}>
          <XCircle className="size-3.5" />
          Cancel
        </Button>
        {/* Buys the customer another week rather than forcing a cancel-and-rebook. */}
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          title="Give this booking another 7 days"
          onClick={() =>
            startTransition(async () => {
              const res = await extendBooking(bookingId, 7);
              if (res.status === "success") {
                toast.success(res.message);
                router.refresh();
              } else {
                toast.error(res.message);
              }
            })
          }
        >
          <CalendarPlus className="size-3.5" />
          Extend
        </Button>
        <Button size="sm" onClick={() => setSheet("complete")}>
          <Handshake className="size-3.5" />
          Complete sale
        </Button>
      </div>

      <Sheet
        open={sheet === "complete"}
        onClose={() => setSheet(null)}
        title="Complete this sale"
        description={`${vehicleLabel} → ${customerName}`}
        size="md"
      >
        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await recordSale({
                vehicleId,
                bookingId,
                leadId,
                customerName,
                customerPhone,
                salePrice: Number(fd.get("salePrice") ?? 0),
                otherCharges: Number(fd.get("otherCharges") ?? 0),
                paymentMode: String(fd.get("paymentMode") ?? ""),
                financeProvider: String(fd.get("financeProvider") ?? ""),
                soldAt: String(fd.get("soldAt") ?? ""),
              });
              if (res.status === "error") {
                setError(res.message);
              } else {
                toast.success("Sale recorded", res.message);
                setSheet(null);
                router.refresh();
              }
            });
          }}
          className="space-y-4"
        >
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Final sale price" required>
              <Input name="salePrice" type="number" required prefix="₹" defaultValue={agreedPrice} inputMode="numeric" />
            </Field>
            <Field label="Other charges">
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
              </Select>
            </Field>
            <Field label="Finance provider" className="sm:col-span-2">
              <Input name="financeProvider" placeholder="e.g. HDFC Bank" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSheet(null)}>Cancel</Button>
            <Button type="submit" loading={pending}>Complete sale</Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "cancel"}
        onClose={() => setSheet(null)}
        title="Cancel this booking"
        description="The vehicle returns to available stock."
        size="sm"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await cancelBooking(bookingId, String(fd.get("reason") ?? ""));
              if (res.status === "success") {
                toast.info("Booking cancelled", res.message);
                setSheet(null);
                router.refresh();
              } else {
                toast.error(res.message);
              }
            })
          }
          className="space-y-4"
        >
          <Field label="Reason" hint="Recorded against the booking">
            <Textarea name="reason" rows={3} placeholder="Customer's finance was declined." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSheet(null)}>Keep booking</Button>
            <Button type="submit" variant="danger" loading={pending}>Cancel booking</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
