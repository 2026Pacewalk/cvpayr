"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Check, Undo2, X, Clock3 } from "lucide-react";
import { NotificationIcon } from "./NotificationIcon";
import { useToast } from "@/components/ui/Toast";
import {
  markNotificationRead,
  markNotificationUnread,
  dismissNotification,
  actOnNotification,
} from "@/app/actions/notifications";
import { typeMeta, PRIORITY_META } from "@/lib/notifications";
import { relativeTime, formatDateTime, telHref, whatsappHref, cn } from "@/lib/utils";

export type NotificationRowData = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: string;
  isRead: boolean;
  createdAt: string;
  entityType: string | null;
  meta: Record<string, unknown>;
};

/**
 * One notification in the list. Every button does real work: calling logs an
 * activity on the lead, "done" completes the follow-up it points at, and hide
 * only ever removes the row from this person's own inbox.
 */
export function NotificationRow({ n }: { n: NotificationRowData }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [hidden, setHidden] = React.useState(false);

  if (hidden) return null;

  const meta = typeMeta(n.type);
  const priority = PRIORITY_META[n.priority as keyof typeof PRIORITY_META];
  const phone = typeof n.meta?.phone === "string" ? n.meta.phone : null;
  const name = typeof n.meta?.customerName === "string" ? n.meta.customerName : null;
  const isTask = n.entityType === "followup";

  const run = (fn: () => Promise<{ message?: string }>, fallback: string) =>
    startTransition(async () => {
      const res = await fn();
      toast.success(res?.message ?? fallback);
      router.refresh();
    });

  return (
    <div
      className={cn(
        "group relative flex gap-3.5 rounded-[12px] border p-4 transition-colors",
        n.isRead
          ? "border-ink-200 bg-white"
          : n.priority === "critical"
            ? "border-danger-200 bg-danger-50/40"
            : "border-brand-200 bg-brand-50/30",
      )}
    >
      <NotificationIcon type={n.type} priority={n.priority} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          {n.link ? (
            <Link
              href={n.link}
              onClick={() => void markNotificationRead(n.id)}
              className="text-[13.5px] leading-snug font-semibold text-ink-950 hover:text-brand-700"
            >
              {n.title}
            </Link>
          ) : (
            <p className="text-[13.5px] leading-snug font-semibold text-ink-950">{n.title}</p>
          )}
          {(n.priority === "critical" || n.priority === "high") && (
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                n.priority === "critical"
                  ? "bg-danger-100 text-danger-700"
                  : "bg-warning-100 text-warning-700",
              )}
            >
              {priority?.label ?? n.priority}
            </span>
          )}
          {!n.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />}
        </div>

        {n.body && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{n.body}</p>
        )}

        <p className="mt-1.5 text-[11.5px] text-ink-400" title={formatDateTime(n.createdAt)}>
          {meta.label} · {relativeTime(n.createdAt)}
        </p>

        {/* Quick actions — the reason a reminder is worth reading on a phone. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {phone && (
            <>
              <a
                href={telHref(phone)}
                onClick={() => run(() => actOnNotification(n.id, "called"), "Call logged")}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-ink-200 bg-white px-2.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
              >
                <Phone className="size-3.5" />
                Call
              </a>
              <a
                href={whatsappHref(phone, name ? `Hi ${name.split(" ")[0]}, ` : undefined)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => run(() => actOnNotification(n.id, "whatsapped"), "Message logged")}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-success-600 px-2.5 text-[12px] font-medium text-white hover:bg-success-700"
              >
                <MessageCircle className="size-3.5" />
                WhatsApp
              </a>
            </>
          )}

          {isTask && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => actOnNotification(n.id, "done"), "Marked done")}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-ink-200 bg-white px-2.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              <Check className="size-3.5" />
              Mark done
            </button>
          )}

          {!n.isRead && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await markNotificationRead(n.id);
                  return { message: "Marked read" };
                }, "Marked read")
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium text-ink-500 hover:bg-ink-100"
            >
              <Check className="size-3.5" />
              Read
            </button>
          )}

          {n.isRead && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await markNotificationUnread(n.id);
                  return { message: "Marked unread" };
                }, "Marked unread")
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium text-ink-500 hover:bg-ink-100"
            >
              <Undo2 className="size-3.5" />
              Unread
            </button>
          )}

          {!n.isRead && !isTask && !phone && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => actOnNotification(n.id, "snooze", 2),
                  "Hidden for now",
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium text-ink-500 hover:bg-ink-100"
            >
              <Clock3 className="size-3.5" />
              Later
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label="Remove this notification"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setHidden(true);
            await dismissNotification(n.id);
            router.refresh();
          })
        }
        className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-[7px] text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-600 focus-visible:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
