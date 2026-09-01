import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Settings2, AlertTriangle } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { listNotifications, inboxCounts } from "@/server/notifications";
import { PageHeader, EmptyState, Badge } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/Tabs";
import { Pagination } from "@/components/ui/Table";
import { LinkButton } from "@/components/ui/Button";
import { NotificationRow } from "@/components/crm/NotificationRow";
import { NotificationBulkActions } from "@/components/crm/NotificationBulkActions";
import {
  CATEGORY_META,
  NOTIFICATION_CATEGORIES,
  PRIORITY_META,
  NOTIFICATION_PRIORITIES,
  type NotificationCategory,
} from "@/lib/notifications";
import { buildQuery, safeJsonParse, formatDate, startOfDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  const sp = await searchParams;

  const scope = {
    dealerId: user.dealerId,
    userId: user.id,
    branchIds: user.branchIds,
  };

  const page = Math.max(1, Number(sp.page ?? 1));
  const category = NOTIFICATION_CATEGORIES.includes(sp.category as NotificationCategory)
    ? sp.category
    : undefined;
  const priority = NOTIFICATION_PRIORITIES.includes(sp.priority as never)
    ? sp.priority
    : undefined;
  const unreadOnly = sp.view === "unread";

  const [{ items, total }, counts] = await Promise.all([
    listNotifications(
      scope,
      { unreadOnly, category, priority },
      { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE },
    ),
    inboxCounts(scope),
  ]);

  const viewChips = [
    {
      href: `/notifications${buildQuery(sp, { view: undefined, page: undefined })}`,
      label: "All",
      count: counts.all,
      active: !unreadOnly,
    },
    {
      href: `/notifications${buildQuery(sp, { view: "unread", page: undefined })}`,
      label: "Unread",
      count: counts.unread,
      active: unreadOnly,
    },
  ];

  const categoryChips = [
    {
      href: `/notifications${buildQuery(sp, { category: undefined, page: undefined })}`,
      label: "Everything",
      active: !category,
    },
    ...NOTIFICATION_CATEGORIES.filter((c) => c !== "general").map((c) => ({
      href: `/notifications${buildQuery(sp, { category: c, page: undefined })}`,
      label: CATEGORY_META[c].label,
      count: counts.byCategory[c] ?? 0,
      active: category === c,
    })),
  ];

  // Group by day so a long list stays readable without dates on every row.
  const today = startOfDay().getTime();
  const yesterday = today - 86400000;
  const groups = new Map<string, typeof items>();
  for (const n of items) {
    const day = startOfDay(n.createdAt).getTime();
    const label =
      day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(n.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={
          counts.unread
            ? `${counts.unread} unread${counts.critical ? ` · ${counts.critical} need attention now` : ""}`
            : "Nothing is waiting on you"
        }
        actions={
          <div className="flex items-center gap-2">
            <NotificationBulkActions
              unread={counts.unread}
              hasRead={counts.all > counts.unread}
            />
            <LinkButton href="/settings/notifications" variant="outline" size="sm">
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">Settings</span>
            </LinkButton>
          </div>
        }
      />

      {counts.critical > 0 && !unreadOnly && (
        <Link
          href="/notifications?view=unread&priority=critical"
          className="mb-4 flex items-center gap-3 rounded-[12px] border border-danger-200 bg-danger-50 px-4 py-3 transition-colors hover:bg-danger-100"
        >
          <AlertTriangle className="size-4 shrink-0 text-danger-600" />
          <p className="text-[13px] font-medium text-danger-800">
            {counts.critical} critical alert{counts.critical === 1 ? "" : "s"} — overdue
            follow-ups, breached response times or lapsing bookings.
          </p>
        </Link>
      )}

      <div className="mb-3">
        <FilterChips items={viewChips} />
      </div>
      <div className="mb-5">
        <FilterChips items={categoryChips} />
      </div>

      {priority && (
        <div className="mb-4 flex items-center gap-2">
          <Badge tone={PRIORITY_META[priority as keyof typeof PRIORITY_META]?.tone ?? "neutral"}>
            {PRIORITY_META[priority as keyof typeof PRIORITY_META]?.label ?? priority} only
          </Badge>
          <Link
            href={`/notifications${buildQuery(sp, { priority: undefined, page: undefined })}`}
            className="text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
          >
            Clear
          </Link>
        </div>
      )}

      {items.length ? (
        <>
          <div className="space-y-5">
            {[...groups.entries()].map(([label, rows]) => (
              <section key={label}>
                <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                  {label}
                </h2>
                <div className="space-y-2">
                  {rows.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={{
                        id: n.id,
                        type: n.type,
                        title: n.title,
                        body: n.body,
                        link: n.link,
                        priority: n.priority,
                        isRead: n.isRead,
                        createdAt: n.createdAt.toISOString(),
                        entityType: n.entityType,
                        meta: safeJsonParse<Record<string, unknown>>(n.meta, {}),
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/notifications"
            params={sp}
          />
        </>
      ) : (
        <EmptyState
          icon={<Bell className="size-6" />}
          title={
            unreadOnly || category || priority
              ? "Nothing here"
              : "No notifications yet"
          }
          description={
            unreadOnly
              ? "Every alert has been read. New enquiries and due follow-ups will appear the moment they happen."
              : category
                ? `Nothing in ${CATEGORY_META[category as NotificationCategory]?.label.toLowerCase() ?? "this group"} right now.`
                : "New enquiries, follow-up reminders, ageing stock and expiring documents all land here."
          }
          action={
            unreadOnly || category || priority ? (
              <LinkButton href="/notifications" variant="outline">
                Show everything
              </LinkButton>
            ) : null
          }
        />
      )}
    </div>
  );
}
