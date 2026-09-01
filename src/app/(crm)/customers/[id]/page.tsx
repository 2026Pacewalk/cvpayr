import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft, Phone, MessageCircle, Mail, MapPin, CarFront, Handshake, Plus,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardHeader, Badge, Avatar, DataList, EmptyState, StatCard } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { CustomerNotes } from "@/components/crm/CustomerNotes";
import {
  formatPrice, formatDate, formatDateTime, relativeTime, vehicleTitle,
  telHref, whatsappHref,
} from "@/lib/utils";
import {
  LEAD_STAGE_META, LEAD_SOURCE_LABELS, TEST_DRIVE_STATUSES, type LeadStage,
} from "@/lib/constants";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireDealerUser();
  const customer = await db.customer.findFirst({
    where: { id, dealerId: user.dealerId },
    select: { name: true },
  });
  return { title: customer?.name ?? "Customer" };
}

export default async function CustomerDetailPage({ params }: Props) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.CUSTOMERS_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const customer = await db.customer.findFirst({
    where: { id, dealerId: user.dealerId },
    include: {
      leads: {
        orderBy: { createdAt: "desc" },
        include: {
          vehicle: { select: { id: true, stockId: true, year: true, make: true, model: true, variant: true, sellingPrice: true } },
          branch: { select: { name: true } },
          owner: { select: { name: true } },
        },
      },
      testDrives: {
        orderBy: { scheduledAt: "desc" },
        include: { vehicle: { select: { year: true, make: true, model: true } } },
      },
      sales: {
        orderBy: { soldAt: "desc" },
        include: {
          vehicle: { select: { id: true, stockId: true, year: true, make: true, model: true, variant: true } },
          branch: { select: { name: true } },
          salesExecutive: { select: { name: true } },
        },
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        include: { vehicle: { select: { year: true, make: true, model: true } } },
      },
    },
  });

  if (!customer) notFound();

  const firstName = customer.name.split(" ")[0];
  const openLeads = customer.leads.filter(
    (l) => !["won", "lost", "not_interested"].includes(l.stage),
  );
  const totalSpent = customer.sales.reduce((s, x) => s + x.salePrice, 0);

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/customers"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to customers
      </Link>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={customer.name} size="xl" />
          <div className="min-w-0">
            <h1 className="font-display text-[24px] leading-tight font-semibold text-ink-950">
              {customer.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
              <a href={telHref(customer.phone)} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="size-3.5" />
                {customer.phone}
              </a>
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                  <Mail className="size-3.5" />
                  {customer.email}
                </a>
              )}
              {customer.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {customer.city}
                </span>
              )}
            </p>
            <p className="mt-1 text-[12px] text-ink-400">
              Customer since {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={telHref(customer.phone)}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800"
          >
            <Phone className="size-4" />
            Call
          </a>
          <a
            href={whatsappHref(customer.whatsapp ?? customer.phone, `Hi ${firstName},`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-success-600 px-4 text-[13px] font-medium text-white hover:bg-success-700"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          {can(user, PERMISSIONS.LEADS_MANAGE) && (
            <LinkButton href="/leads/new" variant="outline" size="md">
              <Plus className="size-4" />
              New enquiry
            </LinkButton>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total enquiries" value={customer.leads.length} tone="brand" />
        <StatCard label="Open enquiries" value={openLeads.length} tone={openLeads.length ? "warning" : "neutral"} />
        <StatCard label="Test drives" value={customer.testDrives.length} tone="purple" icon={<CarFront className="size-4" />} />
        <StatCard
          label="Purchases"
          value={customer.sales.length}
          sub={totalSpent > 0 ? formatPrice(totalSpent) : undefined}
          tone="success"
          icon={<Handshake className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Purchases */}
          {customer.sales.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader title="Purchased vehicles" icon={<Handshake className="size-4" />} />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {customer.sales.map((s) => (
                  <li key={s.id} className="p-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/inventory/${s.vehicle.id}`}
                          className="text-[14px] font-semibold text-ink-950 hover:text-brand-700"
                        >
                          {vehicleTitle(s.vehicle)}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {s.reference} · {s.vehicle.stockId}
                          {s.branch && ` · ${s.branch.name}`}
                          {s.salesExecutive && ` · sold by ${s.salesExecutive.name}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-[15px] font-semibold text-ink-950">
                          {formatPrice(s.salePrice)}
                        </p>
                        <p className="text-[11.5px] text-ink-400">{formatDate(s.soldAt)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Enquiry history */}
          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader
                title="Enquiry history"
                description={`${customer.leads.length} enquir${customer.leads.length === 1 ? "y" : "ies"}`}
              />
            </div>
            {customer.leads.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {customer.leads.map((l) => {
                  const stage = LEAD_STAGE_META[l.stage as LeadStage];
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/leads/${l.id}`}
                        className="block p-4 transition-colors hover:bg-ink-50 sm:px-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-ink-400">{l.reference}</span>
                              <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                            </div>
                            <p className="mt-1 text-[13.5px] font-medium text-ink-900">
                              {l.vehicle ? vehicleTitle(l.vehicle) : l.requirement ?? "General enquiry"}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-500">
                              {LEAD_SOURCE_LABELS[l.source] ?? l.source}
                              {l.branch && ` · ${l.branch.name}`}
                              {l.owner && ` · ${l.owner.name}`}
                            </p>
                            {l.message && (
                              <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-500">
                                “{l.message}”
                              </p>
                            )}
                            {l.lostReason && (
                              <p className="mt-1 text-[12px] text-danger-600">Lost: {l.lostReason}</p>
                            )}
                          </div>
                          <div className="text-right">
                            {l.vehicle && (
                              <p className="text-[13px] font-semibold text-ink-900">
                                {formatPrice(l.vehicle.sellingPrice)}
                              </p>
                            )}
                            <p className="text-[11.5px] text-ink-400">{relativeTime(l.createdAt)}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="border-t border-ink-100 p-5">
                <EmptyState compact title="No enquiries recorded" />
              </div>
            )}
          </Card>

          {/* Test drives */}
          {customer.testDrives.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader title="Test drives" icon={<CarFront className="size-4" />} />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {customer.testDrives.map((t) => {
                  const meta = TEST_DRIVE_STATUSES.find((s) => s.value === t.status);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-ink-900">
                          {t.vehicle ? `${t.vehicle.year} ${t.vehicle.make} ${t.vehicle.model}` : "Vehicle TBD"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-500">{formatDateTime(t.scheduledAt)}</p>
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
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Contact details" />
            <div className="mt-4">
              <DataList
                columns={1}
                items={[
                  { label: "Mobile", value: customer.phone },
                  { label: "WhatsApp", value: customer.whatsapp ?? customer.phone },
                  { label: "Email", value: customer.email ?? "—" },
                  { label: "City", value: customer.city ?? "—" },
                  { label: "Address", value: customer.address ?? "—", hidden: !customer.address },
                  { label: "Added", value: formatDate(customer.createdAt) },
                ]}
              />
            </div>
          </Card>

          <CustomerNotes
            customerId={customer.id}
            initialNotes={customer.notes ?? ""}
            canEdit={can(user, PERMISSIONS.CUSTOMERS_MANAGE)}
          />

          {customer.bookings.length > 0 && (
            <Card padded={false}>
              <div className="p-4">
                <CardHeader title="Bookings" />
              </div>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {customer.bookings.map((b) => (
                  <li key={b.id} className="p-3.5">
                    <p className="text-[13px] font-medium text-ink-900">
                      {b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : "Vehicle"}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-400">
                      {b.reference} · {formatPrice(b.bookingAmount)} token · {b.status}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
