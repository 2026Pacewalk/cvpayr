import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationIcon } from "@/components/crm/NotificationIcon";
import { AdminMarkAllRead } from "@/components/admin/AdminMarkAllRead";
import { typeMeta } from "@/lib/notifications";
import { relativeTime, formatDateTime, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Platform notifications" };
export const dynamic = "force-dynamic";

/**
 * Platform staff inbox. Rows are addressed to this admin across every tenant,
 * and carry only non-private facts about a dealership — never its CRM data.
 */
export default async function AdminNotificationsPage() {
  const admin = await requireSuperAdmin();

  const notifications = await db.notification.findMany({
    where: { userId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { dealer: { select: { id: true, name: true } } },
  });

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
            Platform notifications
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            {unread ? `${unread} unread` : "Nothing needs attention"} · subscriptions, trials and
            new dealerships
          </p>
        </div>
        {unread > 0 && <AdminMarkAllRead />}
      </div>

      {notifications.length ? (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link ?? "/admin/dealers"}
                className={cn(
                  "flex gap-3.5 rounded-[12px] border bg-white p-4 transition-colors hover:bg-ink-50",
                  n.isRead ? "border-ink-200" : "border-brand-200 bg-brand-50/30",
                )}
              >
                <NotificationIcon type={n.type} priority={n.priority} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13.5px] font-semibold text-ink-950">{n.title}</p>
                    {!n.isRead && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">{n.body}</p>
                  )}
                  <p
                    className="mt-1.5 text-[11.5px] text-ink-400"
                    title={formatDateTime(n.createdAt)}
                  >
                    {typeMeta(n.type).label} · {n.dealer.name} · {relativeTime(n.createdAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[14px] border border-dashed border-ink-200 px-6 py-14 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
            <Bell className="size-5" />
          </span>
          <p className="text-[14.5px] font-semibold text-ink-900">Nothing yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">
            Expiring trials, lapsed subscriptions and new dealerships appear here as the
            scheduled sweep finds them.
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-ink-400">
            <CheckCheck className="size-3.5" />
            Runs automatically every few minutes
          </p>
        </div>
      )}
    </div>
  );
}
