import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, MessageSquare, CheckCircle2, XCircle, MinusCircle, Clock3 } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getSmsStatus, getSmsTemplates, getSmsLogs, getSmsUsage, getOptOuts } from "@/server/sms";
import { db } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, StatCard } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/Tabs";
import { Pagination } from "@/components/ui/Table";
import { SmsSettingsForm } from "@/components/crm/SmsSettingsForm";
import { SmsOptOutManager } from "@/components/crm/SmsOptOutManager";
import { relativeTime, formatDateTime, buildQuery, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "SMS" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const DELIVERY_META: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  delivered: { label: "Delivered", tone: "text-success-600 bg-success-50", icon: CheckCircle2 },
  queued: { label: "Awaiting report", tone: "text-ink-400 bg-ink-100", icon: Clock3 },
  undelivered: { label: "Undelivered", tone: "text-danger-600 bg-danger-50", icon: XCircle },
  expired: { label: "Expired", tone: "text-warning-600 bg-warning-50", icon: Clock3 },
  rejected: { label: "Rejected", tone: "text-danger-600 bg-danger-50", icon: XCircle },
};

export default async function SmsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SETTINGS_MANAGE)) redirect("/settings");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const filter = { status: sp.status, delivery: sp.delivery, q: sp.q?.trim() };

  const [status, templates, logs, usage, optOuts, dealer] = await Promise.all([
    getSmsStatus(user.dealerId),
    getSmsTemplates(user.dealerId, { includeInactive: true }),
    getSmsLogs(user.dealerId, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, filter }),
    getSmsUsage(user.dealerId),
    getOptOuts(user.dealerId),
    db.dealer.findUnique({ where: { id: user.dealerId }, select: { name: true } }),
  ]);

  const chips = [
    { href: `/settings/sms${buildQuery(sp, { status: undefined, delivery: undefined, page: undefined })}`, label: "All", active: !sp.status && !sp.delivery },
    { href: `/settings/sms${buildQuery(sp, { status: "sent", delivery: undefined, page: undefined })}`, label: "Accepted", count: usage.sent, active: sp.status === "sent" && !sp.delivery },
    { href: `/settings/sms${buildQuery(sp, { status: undefined, delivery: "delivered", page: undefined })}`, label: "Delivered", count: usage.delivered, active: sp.delivery === "delivered" },
    { href: `/settings/sms${buildQuery(sp, { status: undefined, delivery: "undelivered", page: undefined })}`, label: "Undelivered", active: sp.delivery === "undelivered" },
    { href: `/settings/sms${buildQuery(sp, { status: "failed", delivery: undefined, page: undefined })}`, label: "Refused", count: usage.failed, active: sp.status === "failed" },
    { href: `/settings/sms${buildQuery(sp, { status: "skipped", delivery: undefined, page: undefined })}`, label: "Skipped", count: usage.skipped, active: sp.status === "skipped" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>

      <PageHeader
        title="SMS"
        description="Send DLT-approved messages to your customers from your own gateway account."
        actions={
          status.active && status.configured ? (
            <Badge tone="success" dot>Sending</Badge>
          ) : status.configured ? (
            <Badge tone="warning" dot>Configured, switched off</Badge>
          ) : (
            <Badge tone="neutral" dot>Not connected</Badge>
          )
        }
      />

      {/* Segments, because that is what the gateway bills on. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sent this month"
          value={usage.monthMessages}
          sub={`${usage.monthSegments} segment${usage.monthSegments === 1 ? "" : "s"} billed`}
          tone="brand"
        />
        <StatCard
          label="Delivered"
          value={usage.reported ? `${Math.round((usage.delivered / usage.reported) * 100)}%` : "—"}
          sub={usage.reported ? `${usage.delivered} of ${usage.reported} reported` : "No reports yet"}
          tone={usage.reported && usage.delivered / usage.reported >= 0.9 ? "success" : "neutral"}
        />
        <StatCard
          label="Refused"
          value={usage.failed}
          tone={usage.failed ? "danger" : "neutral"}
        />
        <StatCard label="Do not message" value={usage.optOuts} tone="neutral" />
      </div>

      <SmsSettingsForm
        status={status}
        templates={templates.map((t) => ({
          id: t.id,
          key: t.key,
          name: t.name,
          body: t.body,
          dltTemplateId: t.dltTemplateId,
          isActive: t.isActive,
          useCount: t.useCount,
        }))}
        dealerName={dealer?.name ?? "your dealership"}
      />

      <div className="mt-5">
        <SmsOptOutManager
          optOuts={optOuts.map((o) => ({
            id: o.id,
            phone: o.phone,
            reason: o.reason,
            source: o.source,
            createdAt: o.createdAt.toISOString(),
          }))}
        />
      </div>

      {/* Every attempt, so nothing can imply a message went out that did not. */}
      <Card className="mt-5" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Message history"
            description="Every attempt. “Accepted” means the gateway took it; “delivered” means the operator confirmed it reached the handset."
            icon={<MessageSquare className="size-4" />}
          />
          <div className="mt-4">
            <SearchInput placeholder="Number, text or template…" />
          </div>
          <div className="mt-3">
            <FilterChips items={chips} />
          </div>
        </div>

        {logs.items.length ? (
          <>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {logs.items.map((log) => {
                const delivery = log.deliveryStatus ? DELIVERY_META[log.deliveryStatus] : null;
                const Icon =
                  log.status === "sent" ? CheckCircle2 : log.status === "failed" ? XCircle : MinusCircle;
                return (
                  <li key={log.id} className="flex gap-3 p-4 sm:px-5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        log.status === "sent"
                          ? "bg-success-50 text-success-600"
                          : log.status === "failed"
                            ? "bg-danger-50 text-danger-600"
                            : "bg-ink-100 text-ink-400",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-900">
                        {log.toNumber || "—"}
                        <span
                          className="text-[11.5px] font-normal text-ink-400"
                          title={formatDateTime(log.createdAt)}
                        >
                          {relativeTime(log.createdAt)}
                        </span>
                        {log.segments > 1 && (
                          <span className="rounded bg-warning-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-warning-700">
                            {log.segments} segments
                          </span>
                        )}
                        {delivery && (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10.5px] font-semibold",
                              delivery.tone,
                            )}
                          >
                            {delivery.label}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">
                        {log.body}
                      </p>
                      {log.error && <p className="mt-1 text-[12px] text-danger-600">{log.error}</p>}
                      {log.failureCode && (
                        <p className="mt-1 text-[11.5px] text-ink-400">
                          Operator code {log.failureCode}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pb-2 sm:px-5">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={logs.total}
                basePath="/settings/sms"
                params={sp}
              />
            </div>
          </>
        ) : (
          <p className="border-t border-ink-100 px-5 py-10 text-center text-[13px] text-ink-500">
            {sp.q || sp.status || sp.delivery
              ? "Nothing matches that filter."
              : "No messages yet. Send yourself a test from a template above."}
          </p>
        )}
      </Card>
    </div>
  );
}
