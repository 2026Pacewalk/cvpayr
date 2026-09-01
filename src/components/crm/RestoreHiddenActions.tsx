"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { restoreDismissedActions } from "@/app/actions/attention";

/** Brings back everything this person has snoozed or hidden. */
export function RestoreHiddenActions({ count }: { count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await restoreDismissedActions();
          toast.success(`${res.count} restored`);
          router.refresh();
        })
      }
    >
      <Undo2 className="size-4" />
      <span className="hidden sm:inline">Show {count} hidden</span>
    </Button>
  );
}
