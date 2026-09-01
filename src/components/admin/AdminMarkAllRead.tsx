"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { markAllPlatformNotificationsRead } from "@/app/actions/admin";

export function AdminMarkAllRead() {
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
          const res = await markAllPlatformNotificationsRead();
          toast.success(`${res.count} marked read`);
          router.refresh();
        })
      }
    >
      <CheckCheck className="size-4" />
      Mark all read
    </Button>
  );
}
