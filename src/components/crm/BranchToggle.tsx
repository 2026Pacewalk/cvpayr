"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Power, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { toggleBranchActive } from "@/app/actions/org";
import { cn } from "@/lib/utils";

export function BranchToggle({ branchId, isActive }: { branchId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await toggleBranchActive(branchId);
          if (res.status === "success") {
            toast.success(res.message ?? "Updated");
            router.refresh();
          } else {
            toast.error(res.message ?? "Could not update");
          }
        })
      }
      disabled={pending}
      aria-label={isActive ? "Deactivate branch" : "Activate branch"}
      title={isActive ? "Deactivate branch" : "Activate branch"}
      className={cn(
        "flex size-8 items-center justify-center rounded-[8px] transition-colors disabled:opacity-60",
        isActive
          ? "text-ink-400 hover:bg-danger-50 hover:text-danger-600"
          : "text-ink-400 hover:bg-success-50 hover:text-success-600",
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
    </button>
  );
}
