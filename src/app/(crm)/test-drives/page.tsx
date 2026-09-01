import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CarFront, Phone, MessageCircle, MapPin } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, StatCard, Badge, Card } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/Tabs";
import { TestDriveActions } from "@/components/crm/TestDriveActions";
import {
  formatDate, formatTime, telHref, whatsappHref, startOfDay, endOfDay,
  buildQuery, vehicleTitle,
} from "@/lib/utils";
import { TEST_DRIVE_STATUSES } from "@/lib/constants";

export const metadata: Metadata = { title: "Test drives" };
export const dynamic = "force-dynamic";

export default async function TestDrivesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const filter = sp.status ?? "upcoming";

  const branchFilter = user.branchIds.length ? { branchId: { in: user.branchIds } } : {};
  const base = { dealerId: user.dealerId, ...branchFilter };

  const where =
    filter === "upcoming"
      ? { ...base, status: { in: ["requested", "confirmed"] }, scheduledAt: { gte: startOfDay() } }
      : filter === "today"
        ? { ...base, scheduledAt: { gte: startOfDay(), lte: endOfDay() } }
        : filter === "all"
          ? base
          : { ...base, status: filter };

  const [items, counts] = await Promise.all([
    db.testDrive.findMany({
      where,
      orderBy: { scheduledAt: filter === "completed" ? "desc" : "asc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true, city: true } },
        vehicle: {
          select: { id: true, stockId: true, year: true, make: true, model: true, variant: true },
        },
        branch: { select: { name: true } },
        assignedTo: { select: { name: true } },
        lead: { select: { id: true, reference: true } },
      },
    }),
    Promise.all([
      db.testDrive.count({
        where: { ...base, status: { in: ["requested", "confirmed"] }, scheduledAt: { gte: startOfDay() } },
      }),
      db.testDrive.count({ where: { ...base, scheduledAt: { gte: startOfDay(), lte: endOfDay() } } }),
      db.testDrive.count({ where: { ...base, status: "requested" } }),
      db.testDrive.count({ where: { ...base, status: "completed" } }),
    ]),
  ]);

  const [upcomingCount, todayCount, requestedCount, completedCount] = counts;

  const chips = [
    { key: "upcoming", label: "Upcoming", count: upcomingCount },
    { key: "today", label: "Today", count: todayCount },
    { key: "requested", label: "Requested", count: requestedCount },
    { key: "completed", label: "Completed", count: completedCount },
    { key: "all", label: "All", count: undefined },
  ].map((c) => ({
    href: `/test-drives${buildQuery(sp, { status: c.key === "upcoming" ? undefined : c.key })}`,
    label: c.label,
    count: c.count,
    active: filter === c.key,
  }));

  const canManage = can(user, PERMISSIONS.LEADS_MANAGE);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Test drives"
        description="Requests from your website and drives booked by the team"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Upcoming" value={upcomingCount} tone="brand" icon={<CarFront className="size-4" />} />
        <StatCard label="Today" value={todayCount} tone={todayCount ? "warning" : "neutral"} />
        <StatCard label="Awaiting confirmation" value={requestedCount} tone={requestedCount ? "info" : "neutral"} />
        <StatCard label="Completed" value={completedCount} tone="success" />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((t) => {
            const meta = TEST_DRIVE_STATUSES.find((s) => s.value === t.status);
            const firstName = t.customer.name.split(" ")[0];
            const label = t.vehicle ? vehicleTitle(t.vehicle) : "Vehicle to be decided";

            return (
              <li key={t.id}>
                <Card padded={false}>
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={meta?.tone ?? "neutral"} dot size="sm">
                            {meta?.label ?? t.status}
                          </Badge>
                          <span className="text-[12.5px] font-medium text-ink-700">
                            {formatDate(t.scheduledAt)} · {formatTime(t.scheduledAt)}
                          </span>
                        </div>

                        <p className="mt-2 text-[15px] font-semibold text-ink-950">
                          {t.customer.name}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink-600">{label}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-400">
                          {t.branch && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {t.branch.name}
                            </span>
                          )}
                          {t.assignedTo && <span>with {t.assignedTo.name}</span>}
                          {t.lead && (
                            <Link href={`/leads/${t.lead.id}`} className="text-brand-700 hover:underline">
                              {t.lead.reference}
                            </Link>
                          )}
                        </p>
                        {t.note && (
                          <p className="mt-2 rounded-[8px] bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">
                            {t.note}
                          </p>
                        )}
                        {t.feedback && (
                          <p className="mt-2 text-[12.5px] text-ink-600">Feedback: “{t.feedback}”</p>
                        )}
                      </div>

                      {canManage && (
                        <TestDriveActions testDriveId={t.id} status={t.status} />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      <a
                        href={telHref(t.customer.phone)}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[9px] border border-ink-200 text-[13px] font-medium text-ink-700 sm:h-9 sm:flex-none sm:px-4"
                      >
                        <Phone className="size-4" />
                        Call
                      </a>
                      <a
                        href={whatsappHref(
                          t.customer.phone,
                          `Hi ${firstName}, confirming your test drive of the ${label} on ${formatDate(t.scheduledAt)} at ${formatTime(t.scheduledAt)}. Please bring your driving licence.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[9px] bg-success-600 text-[13px] font-medium text-white sm:h-9 sm:flex-none sm:px-4"
                      >
                        <MessageCircle className="size-4" />
                        Confirm on WhatsApp
                      </a>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<CarFront className="size-6" />}
          title="No test drives here"
          description="Requests from your website land here automatically, and you can book one from any lead."
        />
      )}
    </div>
  );
}
