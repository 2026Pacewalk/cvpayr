"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserCheck, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { toggleStaffActive } from "@/app/actions/org";
import { cn } from "@/lib/utils";

export function StaffToggle({ staffId, isActive }: { staffId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirm, setConfirm] = React.useState(false);

  const run = () =>
    startTransition(async () => {
      const res = await toggleStaffActive(staffId);
      if (res.status === "success") {
        toast.success(res.message ?? "Updated");
        setConfirm(false);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not update");
      }
    });

  return (
    <>
      <button
        onClick={() => (isActive ? setConfirm(true) : run())}
        disabled={pending}
        aria-label={isActive ? "Deactivate account" : "Reactivate account"}
        title={isActive ? "Deactivate account" : "Reactivate account"}
        className={cn(
          "flex size-8 items-center justify-center rounded-[8px] transition-colors disabled:opacity-60",
          isActive
            ? "text-ink-400 hover:bg-danger-50 hover:text-danger-600"
            : "text-ink-400 hover:bg-success-50 hover:text-success-600",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isActive ? (
          <UserMinus className="size-4" />
        ) : (
          <UserCheck className="size-4" />
        )}
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        loading={pending}
        title="Deactivate this account?"
        confirmLabel="Deactivate"
        message="They will be signed out and cannot log in again until you reactivate them. Their leads, notes and sales history stay exactly as they are."
      />
    </>
  );
}
