"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import {
  markAllNotificationsRead,
  clearReadNotifications,
} from "@/app/actions/notifications";

/** Mark-all-read and clear-the-read-ones. Unread items are never deleted. */
export function NotificationBulkActions({
  unread,
  hasRead,
}: {
  unread: number;
  hasRead: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmClear, setConfirmClear] = React.useState(false);

  return (
    <>
      {unread > 0 && (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await markAllNotificationsRead();
              toast.success(`${res.count} marked read`);
              router.refresh();
            })
          }
        >
          <CheckCheck className="size-4" />
          <span className="hidden sm:inline">Mark all read</span>
        </Button>
      )}

      {hasRead && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Clear read notifications"
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="size-4 text-ink-400" />
        </Button>
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        loading={pending}
        title="Clear read notifications?"
        confirmLabel="Clear"
        message="Everything you have already read is removed from your inbox. Unread alerts stay, and nobody else's inbox is touched."
        onConfirm={() =>
          startTransition(async () => {
            const res = await clearReadNotifications();
            toast.success(`${res.count} cleared`);
            setConfirmClear(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
