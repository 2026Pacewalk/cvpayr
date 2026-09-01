import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, StatCard, Badge, Card } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/Tabs";
import { FollowUpActions } from "@/components/crm/FollowUpActions";
import {
  formatDate, formatTime, telHref, whatsappHref, startOfDay, endOfDay, addDays,
  buildQuery, vehicleTitle, cn,
} from "@/lib/utils";
import { LEAD_STAGE_META, type LeadStage } from "@/lib/constants";

export const metadata: Metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

type Bucket = "today" | "overdue" | "upcoming" | "done" | "all";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const bucket = (sp.bucket ?? "today") as Bucket;

  // Staff without `view_all` only ever see their own follow-ups.
  const mine = can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { assignedToId: user.id };
  const base = { dealerId: user.dealerId, ...mine };

  const now = new Date();
  const ranges: Record<Bucket, object> = {
    today: { status: "pending", dueAt: { gte: startOfDay(), lte: endOfDay() } },
    overdue: { status: "pending", dueAt: { lt: startOfDay() } },
    upcoming: { status: "pending", dueAt: { gt: endOfDay() } },
    done: { status: "done" },
    all: {},
  };

  const [items, counts] = await Promise.all([
    db.followUp.findMany({
      where: { ...base, ...ranges[bucket] },
      orderBy: bucket === "done" ? { completedAt: "desc" } : { dueAt: bucket === "overdue" ? "asc" : "asc" },
      take: 100,
      include: {
        assignedTo: { select: { name: true } },
        lead: {
          include: {
            customer: { select: { id: true, name: true, phone: true, city: true } },
            vehicle: { select: { year: true, make: true, model: true, variant: true, stockId: true } },
            branch: { select: { name: true } },
          },
        },
      },
    }),
    Promise.all([
      db.followUp.count({ where: { ...base, ...ranges.today } }),
      db.followUp.count({ where: { ...base, ...ranges.overdue } }),
      db.followUp.count({ where: { ...base, ...ranges.upcoming } }),
      db.followUp.count({ where: { ...base, status: "done", completedAt: { gte: addDays(now, -7) } } }),
    ]),
  ]);

  const [todayCount, overdueCount, upcomingCount, doneWeek] = counts;
  const params = { ...sp };

  const chips = (["today", "overdue", "upcoming", "done", "all"] as Bucket[]).map((b) => ({
    href: `/followups${buildQuery(params, { bucket: b === "today" ? undefined : b })}`,
    label: { today: "Today", overdue: "Overdue", upcoming: "Upcoming", done: "Completed", all: "All" }[b],
    count: { today: todayCount, overdue: overdueCount, upcoming: upcomingCount, done: undefined, all: undefined }[b],
    active: bucket === b,
  }));

  const canManage = can(user, PERMISSIONS.LEADS_MANAGE);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Follow-ups"
        description={
          can(user, PERMISSIONS.LEADS_VIEW_ALL)
            ? "Every scheduled touchpoint across the team"
            : "Your scheduled touchpoints"
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Due today" value={todayCount} tone={todayCount ? "warning" : "neutral"} icon={<CalendarCheck className="size-4" />} />
        <StatCard label="Overdue" value={overdueCount} tone={overdueCount ? "danger" : "neutral"} />
        <StatCard label="Upcoming" value={upcomingCount} tone="info" />
        <StatCard label="Completed this week" value={doneWeek} tone="success" />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((f) => {
            const overdue = f.status === "pending" && f.dueAt < now;
            const stage = LEAD_STAGE_META[f.lead.stage as LeadStage];
            const firstName = f.lead.customer.name.split(" ")[0];
            const vehicleLabel = f.lead.vehicle ? vehicleTitle(f.lead.vehicle) : null;

            return (
              <li key={f.id}>
                <Card padded={false} className={cn(overdue && "border-danger-200")}>
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={f.status === "done" ? "success" : overdue ? "danger" : "warning"}
                            size="sm"
                          >
                            {f.status === "done"
                              ? `Done ${formatDate(f.completedAt)}`
                              : `${overdue ? "Overdue" : "Due"} ${formatDate(f.dueAt)} · ${formatTime(f.dueAt)}`}
                          </Badge>
                          <span className="text-[12px] text-ink-500 capitalize">{f.type}</span>
                          <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                        </div>

                        <Link
                          href={`/leads/${f.lead.id}`}
                          className="mt-2 block text-[15px] font-semibold text-ink-950 hover:text-brand-700"
                        >
                          {f.lead.customer.name}
                        </Link>
                        <p className="mt-0.5 text-[12.5px] text-ink-500">
                          {vehicleLabel ?? f.lead.requirement ?? "General enquiry"}
                          {f.lead.branch && ` · ${f.lead.branch.name}`}
                          {f.assignedTo && ` · ${f.assignedTo.name}`}
                        </p>
                        {f.note && (
                          <p className="mt-2 rounded-[8px] bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">
                            {f.note}
                          </p>
                        )}
                        {f.outcome && (
                          <p className="mt-2 text-[12.5px] text-success-700">✓ {f.outcome}</p>
                        )}
                      </div>

                      {f.status === "pending" && canManage && (
                        <div className="hidden sm:block">
                          <FollowUpActions followUpId={f.id} dueAt={f.dueAt.toISOString()} />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      <a
                        href={telHref(f.lead.customer.phone)}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[9px] border border-ink-200 text-[13px] font-medium text-ink-700 sm:h-9 sm:flex-none sm:px-4"
                      >
                        <Phone className="size-4" />
                        Call
                      </a>
                      <a
                        href={whatsappHref(
                          f.lead.customer.phone,
                          vehicleLabel
                            ? `Hi ${firstName}, following up on the ${vehicleLabel}. Is this a good time to talk?`
                            : `Hi ${firstName}, following up on your enquiry with us.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[9px] bg-success-600 text-[13px] font-medium text-white sm:h-9 sm:flex-none sm:px-4"
                      >
                        <MessageCircle className="size-4" />
                        WhatsApp
                      </a>
                      {f.status === "pending" && canManage && (
                        <div className="w-full sm:hidden">
                          <FollowUpActions followUpId={f.id} dueAt={f.dueAt.toISOString()} />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="size-6" />}
          title={
            bucket === "overdue"
              ? "Nothing overdue"
              : bucket === "today"
                ? "Nothing due today"
                : "No follow-ups here"
          }
          description="Schedule follow-ups from any lead so nothing slips through."
        />
      )}
    </div>
  );
}
