import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft, Phone, MessageCircle, Mail, MapPin, Clock3, CarFront,
  StickyNote, UserCheck, ArrowRightLeft, Handshake, CalendarCheck, Zap, CheckCircle2,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardHeader, Badge, Avatar, DataList, EmptyState } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { LinkButton } from "@/components/ui/Button";
import { StageStepper, LeadActions, NoteComposer } from "@/components/crm/LeadWorkspace";
import { FollowUpActions } from "@/components/crm/FollowUpActions";
import { VehicleImage } from "@/components/VehicleImage";
import {
  formatPrice, formatDate, formatDateTime, formatTime, relativeTime, vehicleTitle,
  telHref, whatsappHref, cn,
} from "@/lib/utils";
import {
  LEAD_STAGE_META, LEAD_SOURCE_LABELS, LEAD_PRIORITIES, TEST_DRIVE_STATUSES,
  type LeadStage,
} from "@/lib/constants";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const ACTIVITY_ICONS: Record<string, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  stage_change: ArrowRightLeft,
  assignment: UserCheck,
  test_drive: CarFront,
  booking: Handshake,
  sale: Handshake,
  follow_up: CalendarCheck,
  system: Zap,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireDealerUser();
  const lead = await db.lead.findFirst({
    where: { id, dealerId: user.dealerId },
    select: { reference: true, customer: { select: { name: true } } },
  });
  return { title: lead ? `${lead.customer.name} · ${lead.reference}` : "Lead" };
}

export default async function LeadDetailPage({ params, searchParams }: Props) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;

  const lead = await db.lead.findFirst({
    where: {
      id,
      dealerId: user.dealerId,
      ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
    },
    include: {
      customer: {
        include: {
          _count: { select: { leads: true, testDrives: true, sales: true } },
        },
      },
      vehicle: {
        include: {
          branch: { select: { name: true, city: true } },
          images: {
            select: { url: true },
            where: { kind: "photo" },
            orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
            take: 1,
          },
        },
      },
      branch: true,
      owner: { select: { id: true, name: true, phone: true, avatarUrl: true, designation: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
        take: 60,
      },
      followUps: {
        orderBy: { dueAt: "asc" },
        include: { assignedTo: { select: { name: true } } },
      },
      testDrives: {
        orderBy: { scheduledAt: "desc" },
        include: {
          vehicle: { select: { year: true, make: true, model: true, stockId: true } },
          assignedTo: { select: { name: true } },
        },
      },
      bookings: { orderBy: { createdAt: "desc" } },
      sales: { orderBy: { soldAt: "desc" } },
    },
  });

  if (!lead) notFound();
  if (!isBranchAllowed(user, lead.branchId)) redirect("/leads");

  const [staff, otherLeads] = await Promise.all([
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.lead.findMany({
      where: { dealerId: user.dealerId, customerId: lead.customerId, id: { not: lead.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { vehicle: { select: { year: true, make: true, model: true } } },
    }),
  ]);

  const stage = LEAD_STAGE_META[lead.stage as LeadStage];
  const priority = LEAD_PRIORITIES.find((p) => p.value === lead.priority);
  const pendingFollowUps = lead.followUps.filter((f) => f.status === "pending");
  const canManage = can(user, PERMISSIONS.LEADS_MANAGE);
  const firstName = lead.customer.name.split(" ")[0];

  const whatsappMessage = lead.vehicle
    ? `Hi ${firstName}, following up on your enquiry for the ${vehicleTitle(lead.vehicle)}.`
    : `Hi ${firstName}, following up on your enquiry with ${user.dealerName}.`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/leads"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to leads
      </Link>

      {sp.created && (
        <Alert tone="success" title="Lead created" className="mb-4">
          It is now in your pipeline.
        </Alert>
      )}

      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar name={lead.customer.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] text-ink-400">{lead.reference}</span>
              <Badge tone={stage.tone} dot>{stage.label}</Badge>
              {priority && (
                <Badge tone={priority.tone} size="sm">{priority.label} priority</Badge>
              )}
            </div>
            <h1 className="mt-1.5 font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
              {lead.customer.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
              <a href={telHref(lead.customer.phone)} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="size-3.5" />
                {lead.customer.phone}
              </a>
              {lead.customer.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {lead.customer.city}
                </span>
              )}
              <span>Created {relativeTime(lead.createdAt)}</span>
              <span>via {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</span>
            </p>
          </div>
        </div>
      </div>

      <StageStepper leadId={lead.id} stage={lead.stage} canManage={canManage} />

      {lead.lostReason && (
        <Alert tone="warning" title="Lost reason" className="mt-4">
          {lead.lostReason}
        </Alert>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          {/* Quick actions on mobile appear first */}
          <div className="lg:hidden">
            <Card>
              <LeadActions
                leadId={lead.id}
                stage={lead.stage}
                ownerId={lead.ownerId}
                customerName={lead.customer.name}
                customerPhone={lead.customer.phone}
                vehicleId={lead.vehicleId}
                vehicleLabel={lead.vehicle ? vehicleTitle(lead.vehicle) : null}
                vehiclePrice={lead.vehicle?.sellingPrice ?? null}
                staff={staff}
                canManage={canManage}
                canAssign={can(user, PERMISSIONS.LEADS_ASSIGN)}
                canSell={can(user, PERMISSIONS.SALES_MANAGE)}
              />
            </Card>
          </div>

          {/* Interested vehicle */}
          {lead.vehicle ? (
            <Card>
              <CardHeader title="Interested vehicle" icon={<CarFront className="size-4" />} />
              <Link
                href={`/inventory/${lead.vehicle.id}`}
                className="mt-4 flex gap-3.5 rounded-[10px] p-2 transition-colors hover:bg-ink-50"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
                  <VehicleImage src={lead.vehicle.images[0]?.url} alt="" className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10.5px] text-ink-400">{lead.vehicle.stockId}</p>
                  <p className="text-[14.5px] font-semibold text-ink-950">
                    {vehicleTitle(lead.vehicle)}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-500">
                    {lead.vehicle.branch.name} · {lead.vehicle.kmDriven.toLocaleString("en-IN")} km ·{" "}
                    {lead.vehicle.fuelType}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-display text-[15px] font-semibold text-ink-950">
                      {formatPrice(lead.vehicle.sellingPrice)}
                    </span>
                    <Badge tone="neutral" size="sm">{lead.vehicle.status}</Badge>
                  </div>
                </div>
              </Link>
            </Card>
          ) : (
            <Card>
              <CardHeader title="No vehicle linked" description="Match this lead to stock to speed things up." />
              <div className="mt-4">
                <LinkButton href="/quick-search" variant="outline" size="sm">
                  <Zap className="size-4" />
                  Find matching cars
                </LinkButton>
              </div>
            </Card>
          )}

          {/* Requirement / message */}
          {(lead.message || lead.requirement) && (
            <Card>
              <CardHeader title="What the customer said" />
              {lead.requirement && (
                <p className="mt-3 rounded-[10px] bg-brand-50 p-3.5 text-[13.5px] leading-relaxed text-brand-900">
                  <span className="font-semibold">Requirement: </span>
                  {lead.requirement}
                </p>
              )}
              {lead.message && (
                <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-600">
                  “{lead.message}”
                </p>
              )}
            </Card>
          )}

          {/* Follow-ups */}
          {pendingFollowUps.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader
                  title="Pending follow-ups"
                  icon={<CalendarCheck className="size-4" />}
                  description={`${pendingFollowUps.length} scheduled`}
                />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {pendingFollowUps.map((f) => {
                  const overdue = f.dueAt < new Date();
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={overdue ? "danger" : "warning"} size="sm">
                            {overdue ? "Overdue" : "Due"} {formatDate(f.dueAt)} · {formatTime(f.dueAt)}
                          </Badge>
                          <span className="text-[12px] text-ink-500 capitalize">{f.type}</span>
                          {f.assignedTo && (
                            <span className="text-[12px] text-ink-400">{f.assignedTo.name}</span>
                          )}
                        </div>
                        {f.note && <p className="mt-1.5 text-[13px] text-ink-600">{f.note}</p>}
                      </div>
                      {canManage && <FollowUpActions followUpId={f.id} dueAt={f.dueAt.toISOString()} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Test drives */}
          {lead.testDrives.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader title="Test drives" icon={<CarFront className="size-4" />} />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {lead.testDrives.map((t) => {
                  const meta = TEST_DRIVE_STATUSES.find((s) => s.value === t.status);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-ink-900">
                          {t.vehicle ? `${t.vehicle.year} ${t.vehicle.make} ${t.vehicle.model}` : "Vehicle TBD"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {formatDateTime(t.scheduledAt)}
                          {t.assignedTo && ` · with ${t.assignedTo.name}`}
                        </p>
                        {t.feedback && (
                          <p className="mt-1 text-[12.5px] text-ink-600">“{t.feedback}”</p>
                        )}
                      </div>
                      <Badge tone={meta?.tone ?? "neutral"} size="sm">{meta?.label ?? t.status}</Badge>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Booking / sale */}
          {(lead.bookings.length > 0 || lead.sales.length > 0) && (
            <Card>
              <CardHeader title="Deal record" icon={<Handshake className="size-4" />} />
              <div className="mt-4 space-y-4">
                {lead.sales.map((s) => (
                  <div key={s.id} className="rounded-[10px] border border-success-100 bg-success-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-success-600" />
                      <p className="text-[13.5px] font-semibold text-success-700">
                        Sold — {s.reference}
                      </p>
                    </div>
                    <div className="mt-3">
                      <DataList
                        columns={3}
                        items={[
                          { label: "Sale price", value: formatPrice(s.salePrice) },
                          { label: "Sold on", value: formatDate(s.soldAt) },
                          { label: "Payment", value: s.paymentMode ?? "-" },
                        ]}
                      />
                    </div>
                  </div>
                ))}
                {lead.bookings.map((b) => (
                  <div key={b.id} className="rounded-[10px] border border-ink-200 p-4">
                    <p className="text-[13.5px] font-semibold text-ink-900">
                      Booking {b.reference} · {b.status}
                    </p>
                    <div className="mt-3">
                      <DataList
                        columns={3}
                        items={[
                          { label: "Token", value: formatPrice(b.bookingAmount) },
                          { label: "Agreed price", value: formatPrice(b.agreedPrice) },
                          { label: "Booked on", value: formatDate(b.bookedAt) },
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Notes + timeline */}
          {canManage && <NoteComposer leadId={lead.id} />}

          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader
                title="Activity timeline"
                description={`${lead.activities.length} events`}
              />
            </div>
            {lead.activities.length ? (
              <ol className="border-t border-ink-100 p-4 sm:p-5">
                {lead.activities.map((a, i) => {
                  const Icon = ACTIVITY_ICONS[a.type] ?? Zap;
                  return (
                    <li key={a.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                      {i !== lead.activities.length - 1 && (
                        <span className="absolute top-9 left-[15px] h-full w-px bg-ink-200" aria-hidden />
                      )}
                      <span
                        className={cn(
                          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                          a.type === "sale" || a.type === "booking"
                            ? "bg-success-50 text-success-600"
                            : a.type === "stage_change"
                              ? "bg-brand-50 text-brand-600"
                              : "bg-ink-100 text-ink-500",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-[13.5px] font-medium text-ink-900">{a.title}</p>
                        {a.body && (
                          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-ink-600">
                            {a.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11.5px] text-ink-400">
                          {formatDateTime(a.createdAt)}
                          {a.user && ` · ${a.user.name}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="border-t border-ink-100 p-5">
                <EmptyState compact title="No activity yet" />
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="hidden lg:block">
            <Card>
              <CardHeader title="Quick actions" />
              <div className="mt-4">
                <LeadActions
                  leadId={lead.id}
                  stage={lead.stage}
                  ownerId={lead.ownerId}
                  customerName={lead.customer.name}
                  customerPhone={lead.customer.phone}
                  vehicleId={lead.vehicleId}
                  vehicleLabel={lead.vehicle ? vehicleTitle(lead.vehicle) : null}
                  vehiclePrice={lead.vehicle?.sellingPrice ?? null}
                  staff={staff}
                  canManage={canManage}
                  canAssign={can(user, PERMISSIONS.LEADS_ASSIGN)}
                  canSell={can(user, PERMISSIONS.SALES_MANAGE)}
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Lead details" />
            <div className="mt-4">
              <DataList
                columns={1}
                items={[
                  { label: "Owner", value: lead.owner?.name ?? "Unassigned" },
                  { label: "Branch", value: lead.branch?.name ?? "Not set" },
                  { label: "Source", value: LEAD_SOURCE_LABELS[lead.source] ?? lead.source },
                  { label: "Priority", value: priority?.label ?? lead.priority },
                  { label: "Created", value: formatDateTime(lead.createdAt) },
                  { label: "Last activity", value: relativeTime(lead.lastActivityAt) },
                  {
                    label: "Next follow-up",
                    value: lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "None scheduled",
                  },
                  {
                    label: "Campaign",
                    value: [lead.utmSource, lead.utmCampaign].filter(Boolean).join(" · ") || "—",
                    hidden: !lead.utmSource && !lead.utmCampaign,
                  },
                  { label: "Landing page", value: lead.pageUrl ?? "—", hidden: !lead.pageUrl },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Customer"
              action={
                can(user, PERMISSIONS.CUSTOMERS_VIEW) ? (
                  <Link
                    href={`/customers/${lead.customerId}`}
                    className="text-[12.5px] font-medium text-brand-700 hover:underline"
                  >
                    Full profile
                  </Link>
                ) : null
              }
            />
            <div className="mt-4 space-y-3 text-[13px]">
              <a
                href={telHref(lead.customer.phone)}
                className="flex items-center gap-2.5 text-ink-700 hover:text-brand-700"
              >
                <Phone className="size-4 text-ink-400" />
                {lead.customer.phone}
              </a>
              <a
                href={whatsappHref(lead.customer.whatsapp ?? lead.customer.phone, whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-ink-700 hover:text-success-700"
              >
                <MessageCircle className="size-4 text-ink-400" />
                {lead.customer.whatsapp ?? lead.customer.phone}
              </a>
              {lead.customer.email && (
                <a
                  href={`mailto:${lead.customer.email}`}
                  className="flex items-center gap-2.5 break-all text-ink-700 hover:text-brand-700"
                >
                  <Mail className="size-4 shrink-0 text-ink-400" />
                  {lead.customer.email}
                </a>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-4 text-center">
              {[
                { k: "Enquiries", v: lead.customer._count.leads },
                { k: "Test drives", v: lead.customer._count.testDrives },
                { k: "Purchases", v: lead.customer._count.sales },
              ].map((s) => (
                <div key={s.k}>
                  <p className="font-display text-[16px] font-semibold text-ink-950 tabular-nums">
                    {s.v}
                  </p>
                  <p className="text-[11px] text-ink-400">{s.k}</p>
                </div>
              ))}
            </div>
          </Card>

          {otherLeads.length > 0 && (
            <Card padded={false}>
              <div className="p-4">
                <CardHeader title="Other enquiries" description="Same customer" />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {otherLeads.map((l) => {
                  const s = LEAD_STAGE_META[l.stage as LeadStage];
                  return (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className="block p-3.5 hover:bg-ink-50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[12.5px] text-ink-700">
                            {l.vehicle ? `${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model}` : "General"}
                          </p>
                          <Badge tone={s.tone} size="sm">{s.short}</Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-400">
                          {l.reference} · {relativeTime(l.createdAt)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
