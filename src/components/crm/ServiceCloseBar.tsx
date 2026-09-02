"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageSquare, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet, ConfirmDialog } from "@/components/ui/Overlay";
import { Field, Input, Textarea, Switch } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/primitives";
import {
  closeVisit,
  setServiceStatus,
  retryFeedbackSms,
  deleteServiceVisit,
} from "@/app/actions/service";
import { cn } from "@/lib/utils";

const STAGES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "ready", label: "Ready" },
];

/**
 * The controls on a job card.
 *
 * Closing is deliberately a sheet rather than a one-tap status change: it is
 * the moment the customer gets messaged, so the advisor should see what is
 * about to be sent and be able to hold it back.
 */
export function ServiceCloseBar({
  visitId,
  status,
  customerName,
  customerPhone,
  workDone,
  amount,
  feedbackSent,
  smsReady,
  previewText,
  canDelete,
}: {
  visitId: string;
  status: string;
  customerName: string;
  customerPhone: string;
  workDone: string | null;
  amount: number | null;
  feedbackSent: boolean;
  /** SMS is configured and switched on for this dealership. */
  smsReady: boolean;
  /** Exactly what the customer will receive, already rendered. */
  previewText: string | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [closing, setClosing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [sendSms, setSendSms] = React.useState(true);

  const isClosed = status === "closed" || status === "cancelled";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-ink-200 bg-white p-2.5">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending || status === s.value || isClosed}
              onClick={() =>
                startTransition(async () => {
                  const res = await setServiceStatus(visitId, s.value);
                  if (res.status === "success") toast.success(res.message);
                  else toast.error(res.message);
                  router.refresh();
                })
              }
              className={cn(
                "shrink-0 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                status === s.value
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-40",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!isClosed && (
            <Button size="sm" onClick={() => setClosing(true)} disabled={pending}>
              <CheckCircle2 className="size-4" />
              Close &amp; notify
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4 text-danger-600" />
            </Button>
          )}
        </div>
      </div>

      {/* After closing: say plainly whether the message actually went. */}
      {status === "closed" && (
        <div className="mt-3">
          {feedbackSent ? (
            <div className="flex items-center gap-2.5 rounded-[10px] border border-success-200 bg-success-50 px-3.5 py-2.5">
              <MessageSquare className="size-4 shrink-0 text-success-600" />
              <p className="text-[13px] text-success-800">
                Feedback SMS sent to {customerPhone}.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-warning-200 bg-warning-50 px-3.5 py-2.5">
              <AlertTriangle className="size-4 shrink-0 text-warning-600" />
              <p className="flex-1 text-[13px] text-warning-800">
                {smsReady
                  ? "The feedback SMS has not gone out for this visit."
                  : "No feedback SMS — sending is switched off in Settings → SMS."}
              </p>
              {smsReady && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await retryFeedbackSms(visitId);
                      if (res.status === "success") toast.success(res.message);
                      else toast.error(res.message);
                      router.refresh();
                    })
                  }
                >
                  <RefreshCw className="size-3.5" />
                  Send it now
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title="Hand the car back"
        description={`${customerName} · ${customerPhone}`}
        size="md"
      >
        <div className="space-y-4">
          <Field label="Work done" hint="Goes on the job card and the customer's record">
            <Textarea
              id="close-work"
              rows={3}
              defaultValue={workDone ?? ""}
              placeholder="Periodic service, front brake pads replaced, wheel alignment."
            />
          </Field>

          <Field label="Invoice total">
            <Input
              id="close-amount"
              type="number"
              prefix="₹"
              inputMode="numeric"
              defaultValue={amount ?? ""}
              placeholder="8500"
            />
          </Field>

          <div className="rounded-[10px] border border-ink-200 p-3.5">
            <Switch
              checked={sendSms && smsReady}
              disabled={!smsReady || feedbackSent}
              onChange={(e) => setSendSms(e.target.checked)}
              label="Send the feedback SMS"
              description={
                feedbackSent
                  ? "This customer has already had it for this visit."
                  : smsReady
                    ? "Goes out the moment you close this visit."
                    : "Switched off — turn SMS on in Settings → SMS first."
              }
            />

            {smsReady && sendSms && !feedbackSent && previewText && (
              <p className="mt-3 rounded-[8px] bg-ink-50 p-3 text-[12.5px] leading-relaxed text-ink-700">
                {previewText}
              </p>
            )}

            {smsReady && sendSms && !feedbackSent && !previewText && (
              <Alert tone="warning" title="Nothing will be sent" className="mt-3">
                The feedback template is missing, switched off, or has a placeholder with no
                value — most often the IVR number in Settings → SMS.
              </Alert>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClosing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const work = (document.getElementById("close-work") as HTMLTextAreaElement)?.value;
                  const amt = (document.getElementById("close-amount") as HTMLInputElement)?.value;
                  const res = await closeVisit({
                    visitId,
                    workDone: work,
                    amount: amt,
                    sendSms: sendSms && smsReady,
                  });
                  if (res.sms.attempted && !res.sms.sent) toast.error(res.message);
                  else toast.success(res.message);
                  setClosing(false);
                  router.refresh();
                })
              }
            >
              <CheckCircle2 className="size-4" />
              Close the visit
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={pending}
        title="Delete this visit?"
        confirmLabel="Delete"
        message={`${customerName}'s job card will be removed permanently, along with its history. Cancel it instead if the work simply did not go ahead.`}
        onConfirm={() =>
          startTransition(async () => {
            await deleteServiceVisit(visitId);
          })
        }
      />
    </>
  );
}

/** The status pill used on the list and the detail header. */
export function ServiceStatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; tone: "info" | "warning" | "purple" | "success" | "neutral" }> = {
    open: { label: "Open", tone: "info" },
    in_progress: { label: "In progress", tone: "warning" },
    ready: { label: "Ready", tone: "purple" },
    closed: { label: "Closed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  };
  const m = meta[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={m.tone} size="sm" dot>{m.label}</Badge>;
}
