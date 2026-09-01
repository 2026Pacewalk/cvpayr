import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScrollText, Plus, Pencil, Trash2, LogIn, UserCheck, ArrowRightLeft, Download } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Badge, Avatar } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/Tabs";
import { Pagination } from "@/components/ui/Table";
import { formatDateTime, relativeTime, buildQuery, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const ACTION_META: Record<string, { icon: typeof Plus; tone: string; label: string }> = {
  create: { icon: Plus, tone: "bg-success-50 text-success-600", label: "Created" },
  update: { icon: Pencil, tone: "bg-brand-50 text-brand-600", label: "Updated" },
  delete: { icon: Trash2, tone: "bg-danger-50 text-danger-600", label: "Deleted" },
  login: { icon: LogIn, tone: "bg-ink-100 text-ink-500", label: "Signed in" },
  assign: { icon: UserCheck, tone: "bg-purple-50 text-purple-600", label: "Assigned" },
  status_change: { icon: ArrowRightLeft, tone: "bg-warning-50 text-warning-600", label: "Status" },
  export: { icon: Download, tone: "bg-info-50 text-info-600", label: "Exported" },
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.AUDIT_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const entity = sp.entity;

  const where = {
    dealerId: user.dealerId,
    ...(entity ? { entity } : {}),
  };

  const [logs, total, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, avatarUrl: true } } },
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({
      by: ["entity"],
      where: { dealerId: user.dealerId },
      _count: { _all: true },
    }),
  ]);

  const chips = [
    { href: `/audit`, label: "All", count: entities.reduce((s, e) => s + e._count._all, 0), active: !entity },
    ...entities
      .sort((a, b) => b._count._all - a._count._all)
      .map((e) => ({
        href: `/audit${buildQuery({}, { entity: e.entity })}`,
        label: e.entity.charAt(0).toUpperCase() + e.entity.slice(1),
        count: e._count._all,
        active: entity === e.entity,
      })),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Activity log"
        description="Who changed what, and when. Every mutation across the account is recorded."
      />

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {logs.length ? (
        <>
          <ol className="rounded-[14px] border border-ink-200 bg-white">
            {logs.map((log, i) => {
              const meta = ACTION_META[log.action] ?? ACTION_META.update;
              const Icon = meta.icon;
              return (
                <li
                  key={log.id}
                  className={cn(
                    "flex gap-3.5 p-4",
                    i !== logs.length - 1 && "border-b border-ink-100",
                  )}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink-900">{log.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-400">
                      {log.user && (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={log.user.name} src={log.user.avatarUrl} size="xs" />
                          {log.user.name}
                        </span>
                      )}
                      <Badge tone="neutral" size="sm">{log.entity}</Badge>
                      <span title={formatDateTime(log.createdAt)}>{relativeTime(log.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/audit" params={sp} />
        </>
      ) : (
        <EmptyState
          icon={<ScrollText className="size-6" />}
          title="No activity recorded yet"
          description="Every create, update and status change is logged here for accountability."
        />
      )}
    </div>
  );
}
