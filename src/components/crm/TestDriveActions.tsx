"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, CalendarCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Overlay";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { updateTestDriveStatus } from "@/app/actions/leads";

export function TestDriveActions({
  testDriveId,
  status,
}: {
  testDriveId: string;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [completeOpen, setCompleteOpen] = React.useState(false);

  const set = (next: string) =>
    startTransition(async () => {
      const res = await updateTestDriveStatus(testDriveId, next);
      if (res.status === "success") {
        toast.success(`Marked ${next.replace(/_/g, " ")}`);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not update");
      }
    });

  const closed = status === "completed" || status === "cancelled";

  return (
    <>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {status === "requested" && (
          <Button size="sm" onClick={() => set("confirmed")} loading={pending}>
            <CalendarCheck className="size-3.5" />
            Confirm
          </Button>
        )}
        {!closed && (
          <>
            <Button size="sm" variant="success" onClick={() => setCompleteOpen(true)}>
              <Check className="size-3.5" />
              Completed
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set("no_show")} loading={pending}>
              <UserX className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set("cancelled")} loading={pending}>
              <X className="size-3.5" />
            </Button>
          </>
        )}
      </div>

      <Sheet
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Test drive completed"
        description="Capture what the customer thought — it shapes the next conversation."
        size="sm"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await updateTestDriveStatus(
                testDriveId,
                "completed",
                String(fd.get("feedback") ?? ""),
              );
              if (res.status === "success") {
                toast.success("Test drive completed");
                setCompleteOpen(false);
                router.refresh();
              } else {
                toast.error(res.message ?? "Could not update");
              }
            })
          }
          className="space-y-4"
        >
          <Field label="Customer feedback">
            <Textarea
              name="feedback"
              rows={3}
              placeholder="Liked the drive and the interiors. Concerned about the boot space. Comparing with the Seltos."
            />
          </Field>
          <div className="rounded-[10px] bg-info-50 p-3 text-[12.5px] text-info-700">
            The linked lead moves to <strong>Test Drive Completed</strong>.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={pending}>Save</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
