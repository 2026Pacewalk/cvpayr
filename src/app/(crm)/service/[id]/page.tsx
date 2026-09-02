import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Phone, MessageCircle, Wrench, ClipboardList } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateServiceVisit } from "@/app/actions/service";
import { FEEDBACK_TEMPLATE_KEY } from "@/server/service";
import { getSmsStatus } from "@/server/sms";
import { renderSms } from "@/lib/sms";
import { ServiceVisitForm } from "@/components/crm/ServiceVisitForm";
import { ServiceCloseBar, ServiceStatusBadge } from "@/components/crm/ServiceCloseBar";
import { PageHeader, Card, CardHeader, DataList, Avatar } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { formatPrice, formatDateTime, relativeTime, telHref, whatsappHref } from "@/lib/utils";

export const metadata: Metadata = { title: "Service visit" };
export const dynamic = "force-dynamic";

export default async function ServiceVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SERVICE_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;

  const visit = await db.serviceVisit.findFirst({
    where: { id, dealerId: user.dealerId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      branch: { select: { id: true, name: true } },
      assignedTo: { select: { name: true } },
    },
  });
  if (!visit) notFound();
  if (!isBranchAllowed(user, visit.branchId)) redirect("/service");

  const [branches, advisors, smsStatus, template, dealer] = await Promise.all([
    db.branch.findMany({
      where: {
        dealerId: user.dealerId,
        isActive: true,
        ...(user.branchIds.length ? { id: { in: user.branchIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getSmsStatus(user.dealerId),
    db.smsTemplate.findUnique({
      where: { dealerId_key: { dealerId: user.dealerId, key: FEEDBACK_TEMPLATE_KEY } },
    }),
    db.dealer.findUnique({ where: { id: user.dealerId }, select: { name: true } }),
  ]);

  // Exactly what the customer would receive — rendered here so the advisor sees
  // the real message, and so an unfillable placeholder shows up before sending.
  let previewText: string | null = null;
  if (template?.isActive) {
    const { text, unresolved } = renderSms(template.body, {
      ivrNumber: smsStatus.ivrNumber,
      customerName: visit.customer.name,
      extra: { var: dealer?.name ?? "" },
    });
    previewText = unresolved.length ? null : text;
  }

  const car = [visit.make, visit.model].filter(Boolean).join(" ");
  const canManage = can(user, PERMISSIONS.SERVICE_MANAGE);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/service"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to service
      </Link>

      {sp.created && (
        <Alert tone="success" title="Booked in" className="mb-4">
          The job card is open. Close it when you hand the car back.
        </Alert>
      )}

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Avatar name={visit.customer.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[24px] leading-tight font-semibold text-ink-950">
              {visit.customer.name}
            </h1>
            <ServiceStatusBadge status={visit.status} />
          </div>
          <p className="mt-1 text-[13.5px] text-ink-500">
            {visit.jobCardNumber && <span className="font-mono">{visit.jobCardNumber}</span>}
            {visit.registrationNumber && <span> · {visit.registrationNumber}</span>}
            {car && <span> · {car}</span>}
            <span> · booked in {relativeTime(visit.openedAt)}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href={telHref(visit.customer.phone)}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[13.5px] font-medium text-white hover:bg-ink-800"
          >
            <Phone className="size-4" />
            Call
          </a>
          <a
            href={whatsappHref(
              visit.customer.phone,
              `Hi ${visit.customer.name.split(" ")[0]}, an update on your ${car || "car"}:`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-success-600 px-4 text-[13.5px] font-medium text-white hover:bg-success-700"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        </div>
      </div>

      {canManage && (
        <ServiceCloseBar
          visitId={visit.id}
          status={visit.status}
          customerName={visit.customer.name}
          customerPhone={visit.customer.phone}
          workDone={visit.workDone}
          amount={visit.amount}
          feedbackSent={Boolean(visit.feedbackSmsAt)}
          smsReady={smsStatus.configured && smsStatus.active}
          previewText={previewText}
          canDelete={can(user, PERMISSIONS.SETTINGS_MANAGE)}
        />
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {canManage ? (
            <ServiceVisitForm
              action={updateServiceVisit.bind(null, visit.id)}
              customers={[]}
              branches={branches}
              advisors={advisors}
              lockedCustomer={visit.customer}
              submitLabel="Save changes"
              cancelHref="/service"
              showOutcome
              values={{
                registrationNumber: visit.registrationNumber,
                make: visit.make,
                model: visit.model,
                odometerKm: visit.odometerKm,
                serviceType: visit.serviceType,
                complaint: visit.complaint,
                workDone: visit.workDone,
                amount: visit.amount,
                promisedAt: visit.promisedAt,
                assignedToId: visit.assignedToId,
                branchId: visit.branchId,
                notes: visit.notes,
                jobCardNumber: visit.jobCardNumber,
              }}
            />
          ) : (
            <Card>
              <CardHeader title="The job" icon={<Wrench className="size-4" />} />
              <div className="mt-4 space-y-3 text-[13.5px] text-ink-700">
                {visit.complaint && <p>{visit.complaint}</p>}
                {visit.workDone && (
                  <p className="border-t border-ink-100 pt-3">{visit.workDone}</p>
                )}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Visit" icon={<ClipboardList className="size-4" />} />
            <div className="mt-4">
              <DataList
                columns={1}
                items={[
                  { label: "Booked in", value: formatDateTime(visit.openedAt) },
                  {
                    label: "Promised by",
                    value: visit.promisedAt ? formatDateTime(visit.promisedAt) : "Not set",
                  },
                  {
                    label: "Handed back",
                    value: visit.closedAt ? formatDateTime(visit.closedAt) : "Still in",
                  },
                  { label: "Advisor", value: visit.assignedTo?.name ?? "Unassigned" },
                  { label: "Branch", value: visit.branch?.name ?? "—" },
                  {
                    label: "Odometer",
                    value: visit.odometerKm
                      ? `${new Intl.NumberFormat("en-IN").format(visit.odometerKm)} km`
                      : "—",
                  },
                  { label: "Invoice", value: visit.amount ? formatPrice(visit.amount) : "—" },
                  {
                    label: "Feedback SMS",
                    value: visit.feedbackSmsAt
                      ? `Sent ${relativeTime(visit.feedbackSmsAt)}`
                      : "Not sent",
                  },
                ]}
              />
            </div>
          </Card>

          <Link
            href={`/customers/${visit.customer.id}`}
            className="block rounded-[12px] border border-ink-200 bg-white p-4 transition-colors hover:bg-ink-50"
          >
            <p className="text-[13px] font-semibold text-ink-900">Customer history</p>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Every enquiry, test drive, purchase and service visit in one place.
            </p>
          </Link>
        </aside>
      </div>
    </div>
  );
}
