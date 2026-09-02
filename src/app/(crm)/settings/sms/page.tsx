import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getSmsStatus, getSmsTemplates, getSmsLogs, getSmsCounts } from "@/server/sms";
import { db } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, StatCard } from "@/components/ui/primitives";
import { SmsSettingsForm } from "@/components/crm/SmsSettingsForm";
import { relativeTime, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "SMS" };
export const dynamic = "force-dynamic";

export default async function SmsSettingsPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SETTINGS_MANAGE)) redirect("/settings");

  const [status, templates, logs, counts, dealer] = await Promise.all([
    getSmsStatus(user.dealerId),
    getSmsTemplates(user.dealerId, { includeInactive: true }),
    getSmsLogs(user.dealerId, { take: 12 }),
    getSmsCounts(user.dealerId),
    db.dealer.findUnique({ where: { id: user.dealerId }, select: { name: true } }),
  ]);

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

      {(counts.sent > 0 || counts.failed > 0) && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <StatCard label="Delivered to the gateway" value={counts.sent} tone="success" />
          <StatCard
            label="Refused"
            value={counts.failed}
            tone={counts.failed ? "danger" : "neutral"}
          />
        </div>
      )}

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

      {/* Every attempt, so nothing can imply a message went out that did not. */}
      {logs.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Recent messages"
              description="Every attempt, including the ones the gateway refused."
              icon={<MessageSquare className="size-4" />}
            />
          </div>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {logs.map((log) => (
              <li key={log.id} className="flex gap-3 p-4 sm:px-5">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    log.status === "sent"
                      ? "bg-success-50 text-success-600"
                      : "bg-danger-50 text-danger-600",
                  )}
                >
                  {log.status === "sent" ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-ink-900">
                    {log.toNumber || "—"}
                    <span className="text-[11.5px] font-normal text-ink-400">
                      {relativeTime(log.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">
                    {log.body}
                  </p>
                  {log.error && (
                    <p className="mt-1 text-[12px] text-danger-600">{log.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
