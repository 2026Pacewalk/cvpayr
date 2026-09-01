"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CalendarClock, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { completeFollowUp, rescheduleFollowUp } from "@/app/actions/leads";
import { toDateTimeLocal } from "@/lib/utils";

/** Two-tap completion: the action a salesperson repeats dozens of times a day. */
export function FollowUpActions({
  followUpId,
  dueAt,
  compact,
}: {
  followUpId: string;
  dueAt: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [sheet, setSheet] = React.useState<null | "done" | "reschedule">(null);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  return (
    <>
      <div className="flex shrink-0 gap-1.5">
        <Button size={compact ? "xs" : "sm"} variant="outline" onClick={() => setSheet("reschedule")}>
          <CalendarClock className="size-3.5" />
          {!compact && "Reschedule"}
        </Button>
        <Button size={compact ? "xs" : "sm"} variant="success" onClick={() => setSheet("done")}>
          <Check className="size-3.5" />
          {!compact && "Done"}
        </Button>
      </div>

      <Sheet
        open={sheet === "done"}
        onClose={() => setSheet(null)}
        title="Complete this follow-up"
        size="sm"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await completeFollowUp(followUpId, String(fd.get("outcome") ?? ""));
              if (res.status === "success") {
                toast.success("Follow-up completed");
                setSheet(null);
                router.refresh();
              } else {
                toast.error(res.message ?? "Could not update");
              }
            })
          }
          className="space-y-4"
        >
          <Field label="Outcome" hint="Optional — what happened?">
            <Textarea
              name="outcome"
              rows={3}
              placeholder="Spoke to the customer. Coming to see the car on Saturday."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSheet(null)}>Cancel</Button>
            <Button type="submit" variant="success" loading={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Mark done
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "reschedule"}
        onClose={() => setSheet(null)}
        title="Reschedule follow-up"
        size="sm"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await rescheduleFollowUp(followUpId, String(fd.get("dueAt")));
              if (res.status === "success") {
                toast.success("Rescheduled");
                setSheet(null);
                router.refresh();
              } else {
                toast.error(res.message ?? "Could not reschedule");
              }
            })
          }
          className="space-y-4"
        >
          <Field label="New date & time" required>
            <Input
              name="dueAt"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocal(dueAt ? new Date(dueAt) : tomorrow)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Tomorrow 11am", days: 1 },
              { label: "In 3 days", days: 3 },
              { label: "Next week", days: 7 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  const input = form?.querySelector<HTMLInputElement>('input[name="dueAt"]');
                  if (!input) return;
                  const d = new Date();
                  d.setDate(d.getDate() + preset.days);
                  d.setHours(11, 0, 0, 0);
                  input.value = toDateTimeLocal(d);
                }}
                className="rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSheet(null)}>Cancel</Button>
            <Button type="submit" loading={pending}>Reschedule</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
