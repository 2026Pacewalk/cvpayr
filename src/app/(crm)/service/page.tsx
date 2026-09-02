import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench, Plus, Phone, MessageCircle, MessageSquare } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  serviceWhere,
  serviceListSelect,
  getServiceCounts,
  OPEN_SERVICE_STATUSES,
} from "@/server/service";
import { PageHeader, EmptyState, StatCard, Card, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/Tabs";
import { Pagination } from "@/components/ui/Table";
import { Alert } from "@/components/ui/Toast";
import { ServiceStatusBadge } from "@/components/crm/ServiceCloseBar";
import { formatPrice, relativeTime, telHref, whatsappHref, buildQuery } from "@/lib/utils";

export const metadata: Metadata = { title: "Service" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SERVICE_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const status = sp.status;

  const scope = { dealerId: user.dealerId, branchIds: user.branchIds };

  const where = serviceWhere(scope, {
    ...(status === "active"
      ? { status: { in: OPEN_SERVICE_STATUSES } }
      : status
        ? { status }
        : {}),
    ...(q
      ? {
          OR: [
            { customer: { name: { contains: q } } },
            { customer: { phone: { contains: q } } },
            { registrationNumber: { contains: q } },
            { jobCardNumber: { contains: q } },
          ],
        }
      : {}),
  });

  const [items, total, counts] = await Promise.all([
    db.serviceVisit.findMany({
      where,
      orderBy: [{ openedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: serviceListSelect,
    }),
    db.serviceVisit.count({ where }),
    getServiceCounts(scope),
  ]);

  const chips = [
    {
      href: `/service${buildQuery(sp, { status: "active", page: undefined })}`,
      label: "In the workshop",
      count: counts.open + counts.inProgress + counts.ready,
      active: status === "active",
    },
    {
      href: `/service${buildQuery(sp, { status: "ready", page: undefined })}`,
      label: "Ready",
      count: counts.ready,
      active: status === "ready",
    },
    {
      href: `/service${buildQuery(sp, { status: "closed", page: undefined })}`,
      label: "Closed",
      active: status === "closed",
    },
    {
      href: `/service${buildQuery(sp, { status: undefined, page: undefined })}`,
      label: "All",
      count: counts.all,
      active: !status,
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Service"
        description="Job cards for cars in the workshop. Closing one sends the customer your feedback message."
        actions={
          can(user, PERMISSIONS.SERVICE_MANAGE) ? (
            <LinkButton href="/service/new" size="sm">
              <Plus className="size-4" />
              Book a car in
            </LinkButton>
          ) : null
        }
      />

      {sp.deleted && <Alert tone="info" title="Visit deleted" className="mb-4" />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={counts.open} tone="brand" icon={<Wrench className="size-4" />} />
        <StatCard label="On the ramp" value={counts.inProgress} tone="warning" />
        <StatCard label="Ready to collect" value={counts.ready} tone="purple" />
        <StatCard label="Handed back today" value={counts.closedToday} tone="success" />
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Customer, mobile, registration or job card…" className="sm:max-w-md" />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {items.length ? (
        <>
          <div className="space-y-2.5">
            {items.map((v) => {
              const car = [v.make, v.model].filter(Boolean).join(" ");
              return (
                <Card key={v.id} padded={false}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Avatar name={v.customer.name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/service/${v.id}`}
                              className="text-[15px] font-semibold text-ink-950 hover:text-brand-700"
                            >
                              {v.customer.name}
                            </Link>
                            <ServiceStatusBadge status={v.status} />
                            {v.status === "closed" && v.feedbackSmsAt && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] text-success-700"
                                title="Feedback SMS sent"
                              >
                                <MessageSquare className="size-3" />
                                SMS
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-[13.5px] font-medium text-ink-800">
                            {v.registrationNumber ?? "No registration"}
                            {car && <span className="font-normal text-ink-500"> · {car}</span>}
                            {v.amount ? (
                              <span className="font-normal text-ink-500"> · {formatPrice(v.amount)}</span>
                            ) : null}
                          </p>

                          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-400">
                            {v.jobCardNumber && <span className="font-mono">{v.jobCardNumber}</span>}
                            <span>· {v.customer.phone}</span>
                            {v.branch && <span>· {v.branch.name}</span>}
                            {v.assignedTo && <span>· {v.assignedTo.name}</span>}
                            <span>· booked in {relativeTime(v.openedAt)}</span>
                          </p>

                          {v.complaint && (
                            <p className="mt-2 line-clamp-2 rounded-[8px] bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">
                              {v.complaint}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-1.5">
                        <a
                          href={telHref(v.customer.phone)}
                          aria-label={`Call ${v.customer.name}`}
                          className="flex size-9 items-center justify-center rounded-[9px] border border-ink-200 text-ink-600 hover:bg-ink-50"
                        >
                          <Phone className="size-4" />
                        </a>
                        <a
                          href={whatsappHref(
                            v.customer.phone,
                            `Hi ${v.customer.name.split(" ")[0]}, an update on your ${car || "car"}:`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="WhatsApp"
                          className="flex size-9 items-center justify-center rounded-[9px] bg-success-600 text-white hover:bg-success-700"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/service" params={sp} />
        </>
      ) : (
        <EmptyState
          icon={<Wrench className="size-6" />}
          title={q || status ? "Nothing matches" : "No cars booked in yet"}
          description={
            q || status
              ? "Try a different filter."
              : "Book a car in when it arrives for service. When you hand it back, the customer gets your feedback message automatically."
          }
          action={
            can(user, PERMISSIONS.SERVICE_MANAGE) ? (
              <LinkButton href="/service/new">Book the first car in</LinkButton>
            ) : null
          }
        />
      )}
    </div>
  );
}
