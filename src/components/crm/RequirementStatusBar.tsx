"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Sheet } from "@/components/ui/Overlay";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { setRequirementStatus, deleteRequirement } from "@/app/actions/requirements";
import { REQUIREMENT_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Status control for a requirement — mirrors the vehicle status bar pattern. */
export function RequirementStatusBar({
  requirementId,
  status,
  customerName,
  canDelete,
}: {
  requirementId: string;
  status: string;
  customerName: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [closing, setClosing] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const apply = (next: string, reason?: string) =>
    startTransition(async () => {
      const res = await setRequirementStatus(requirementId, next, reason);
      if (res.status === "success") {
        toast.success(res.message ?? "Updated");
        setClosing(null);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not update");
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-ink-200 bg-white p-2.5">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {REQUIREMENT_STATUSES.map((s) => {
            const active = status === s.value;
            const isClosing = ["fulfilled", "cancelled", "expired"].includes(s.value);
            return (
              <button
                key={s.value}
                title={s.help}
                disabled={pending || active}
                onClick={() => (isClosing ? setClosing(s.value) : apply(s.value))}
                className={cn(
                  "shrink-0 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-ink-900 text-white"
                    : "border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4 text-danger-600" />
          </Button>
        )}
      </div>

      <Sheet
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        title={
          closing === "fulfilled"
            ? "Mark this requirement fulfilled"
            : closing === "cancelled"
              ? "Cancel this requirement"
              : "Expire this requirement"
        }
        description={`${customerName}'s brief will stop appearing in match results.`}
        size="sm"
      >
        <form
          action={(fd) => apply(closing!, String(fd.get("reason") ?? ""))}
          className="space-y-4"
        >
          <Field
            label="Reason"
            hint={
              closing === "fulfilled"
                ? "What did they end up buying?"
                : "Why is this no longer active?"
            }
          >
            <Textarea
              name="reason"
              rows={3}
              placeholder={
                closing === "fulfilled"
                  ? "Bought the 2022 Creta SX from the Ludhiana branch."
                  : "Customer postponed their purchase to next year."
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setClosing(null)}>Cancel</Button>
            <Button type="submit" loading={pending} variant={closing === "fulfilled" ? "success" : "primary"}>
              {closing === "fulfilled" && <CheckCircle2 className="size-4" />}
              Confirm
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={pending}
        title="Delete this requirement?"
        confirmLabel="Delete"
        message={`${customerName}'s brief will be removed permanently. To keep the record but stop matching, mark it cancelled instead.`}
        onConfirm={() =>
          startTransition(async () => {
            await deleteRequirement(requirementId);
          })
        }
      />
    </>
  );
}
