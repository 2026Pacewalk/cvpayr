import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft, Phone, MessageCircle, Sparkles, Target, Check, Minus, X, Pencil,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { matchVehiclesForRequirement } from "@/server/matching";
import { Card, CardHeader, Badge, Avatar, DataList, EmptyState, StatCard } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import { VehicleImage } from "@/components/VehicleImage";
import { RequirementStatusBar } from "@/components/crm/RequirementStatusBar";
import {
  formatPrice, formatKm, formatDate, relativeTime, vehicleTitle,
  telHref, whatsappHref, safeJsonParse, cn,
} from "@/lib/utils";
import { REQUIREMENT_STATUS_META, LEAD_PRIORITIES } from "@/lib/constants";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireDealerUser();
  const req = await db.customerRequirement.findFirst({
    where: { id, dealerId: user.dealerId },
    select: { customer: { select: { name: true } } },
  });
  return { title: req ? `${req.customer.name}'s requirement` : "Requirement" };
}

export default async function RequirementDetailPage({ params, searchParams }: Props) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;

  const requirement = await db.customerRequirement.findFirst({
    where: { id, dealerId: user.dealerId },
    include: {
      customer: {
        include: { _count: { select: { leads: true, sales: true, testDrives: true } } },
      },
      branch: { select: { id: true, name: true, city: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!requirement) notFound();

  const matches = ["open", "matched"].includes(requirement.status)
    ? await matchVehiclesForRequirement(requirement, user.dealerId, { limit: 24 })
    : [];

  const meta = REQUIREMENT_STATUS_META[requirement.status];
  const prio = LEAD_PRIORITIES.find((p) => p.value === requirement.priority);
  const fuels = safeJsonParse<string[]>(requirement.fuelTypes, []);
  const transmissions = safeJsonParse<string[]>(requirement.transmissions, []);
  const bodies = safeJsonParse<string[]>(requirement.bodyTypes, []);
  const canManage = can(user, PERMISSIONS.LEADS_MANAGE);
  const firstName = requirement.customer.name.split(" ")[0];

  const strongMatches = matches.filter((m) => m.score >= 80).length;
  // Closed briefs are deliberately excluded from matching, so say that rather
  // than implying nothing in stock fits.
  const isClosed = !["open", "matched"].includes(requirement.status);

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/requirements"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to requirements
      </Link>

      {sp.created && (
        <Alert tone="success" title="Requirement saved" className="mb-4">
          Every car you add from now on is checked against this brief automatically.
        </Alert>
      )}
      {sp.updated && <Alert tone="success" title="Requirement updated" className="mb-4" />}

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar name={requirement.customer.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta?.tone ?? "neutral"} dot>{meta?.label ?? requirement.status}</Badge>
              {prio && <Badge tone={prio.tone} size="sm">{prio.label} priority</Badge>}
            </div>
            <h1 className="mt-2 font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
              {requirement.customer.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
              <a href={telHref(requirement.customer.phone)} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="size-3.5" />
                {requirement.customer.phone}
              </a>
              <span>Recorded {relativeTime(requirement.createdAt)}</span>
              {requirement.createdBy && <span>by {requirement.createdBy.name}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={telHref(requirement.customer.phone)}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800"
          >
            <Phone className="size-4" />
            Call
          </a>
          <a
            href={whatsappHref(
              requirement.customer.phone,
              matches.length
                ? `Hi ${firstName}, I have ${matches.length} car${matches.length === 1 ? "" : "s"} that match what you were looking for. Shall I share the details?`
                : `Hi ${firstName}, following up on the car you were looking for.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-success-600 px-4 text-[13px] font-medium text-white hover:bg-success-700"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          {canManage && (
            <LinkButton href={`/requirements/${requirement.id}/edit`} variant="outline" size="md">
              <Pencil className="size-4" />
              Edit
            </LinkButton>
          )}
        </div>
      </div>

      {canManage && (
        <RequirementStatusBar
          requirementId={requirement.id}
          status={requirement.status}
          customerName={requirement.customer.name}
          canDelete={can(user, PERMISSIONS.LEADS_DELETE)}
        />
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Matches — the whole point of the screen */}
          <Card padded={false} id="matches">
            <div className="p-4 sm:p-5">
              <CardHeader
                title={
                  isClosed
                    ? "Matching is switched off for this brief"
                    : matches.length
                      ? `${matches.length} car${matches.length === 1 ? "" : "s"} in stock match this brief`
                      : "No stock matches right now"
                }
                description={
                  isClosed
                    ? `Marked ${meta?.label?.toLowerCase() ?? requirement.status}${
                        requirement.closedReason ? ` — ${requirement.closedReason}` : ""
                      }. Reopen it to start matching again.`
                    : matches.length
                      ? `${strongMatches} strong match${strongMatches === 1 ? "" : "es"} · ranked by how well each car fits`
                      : "You will be alerted the moment a matching car is added."
                }
                icon={<Sparkles className="size-4" />}
                action={
                  matches.length && can(user, PERMISSIONS.CATALOG_SHARE) ? (
                    <LinkButton
                      href={`/quick-search?${new URLSearchParams({
                        ...(requirement.budgetMax ? { priceMax: String(requirement.budgetMax) } : {}),
                        ...(requirement.budgetMin ? { priceMin: String(requirement.budgetMin) } : {}),
                        ...(requirement.make ? { make: requirement.make } : {}),
                        ...(bodies[0] ? { bodyType: bodies[0] } : {}),
                        ...(fuels[0] ? { fuel: fuels[0] } : {}),
                        ...(transmissions[0] ? { transmission: transmissions[0] } : {}),
                      }).toString()}`}
                      size="sm"
                    >
                      Build a shortlist
                    </LinkButton>
                  ) : null
                }
              />
            </div>

            {matches.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {matches.map((m) => (
                  <li key={m.vehicle.id} className="p-4 sm:px-5">
                    <div className="flex gap-3.5">
                      <Link
                        href={`/inventory/${m.vehicle.id}`}
                        className="relative size-[76px] shrink-0 overflow-hidden rounded-[9px] bg-ink-100"
                      >
                        <VehicleImage
                          src={m.vehicle.images[0]?.url ?? null}
                          alt={vehicleTitle(m.vehicle)}
                          className="size-full"
                        />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[10.5px] text-ink-400">{m.vehicle.stockId}</p>
                            <Link
                              href={`/inventory/${m.vehicle.id}`}
                              className="line-clamp-1 text-[14.5px] font-semibold text-ink-950 hover:text-brand-700"
                            >
                              {vehicleTitle(m.vehicle)}
                            </Link>
                            <p className="mt-0.5 text-[12px] text-ink-500">
                              {formatKm(m.vehicle.kmDriven)} · {m.vehicle.fuelType} ·{" "}
                              {m.vehicle.transmission} · {m.vehicle.branch.name}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-display text-[15px] font-semibold text-ink-950">
                              {formatPrice(m.vehicle.sellingPrice)}
                            </p>
                            <span
                              className={cn(
                                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                m.score >= 80
                                  ? "bg-success-50 text-success-700"
                                  : m.score >= 65
                                    ? "bg-brand-50 text-brand-700"
                                    : "bg-warning-50 text-warning-700",
                              )}
                            >
                              {m.score}% fit
                            </span>
                          </div>
                        </div>

                        {/* Why it matched — the criteria the customer actually stated */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {m.criteria
                            .filter((c) => c.met !== null)
                            .map((c) => (
                              <span
                                key={c.label}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                                  c.met
                                    ? "bg-success-50 text-success-700"
                                    : "bg-ink-100 text-ink-500",
                                )}
                                title={c.detail}
                              >
                                {c.met ? <Check className="size-2.5" /> : <Minus className="size-2.5" />}
                                {c.label}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : isClosed ? null : (
              <div className="border-t border-ink-100 p-5">
                <EmptyState
                  compact
                  icon={<Target className="size-5" />}
                  title="Nothing in stock fits yet"
                  description="This brief stays active and is re-checked against every vehicle you add."
                />
              </div>
            )}
          </Card>

          {requirement.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-600">
                {requirement.notes}
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Matching stock"
              value={matches.length}
              tone={matches.length ? "success" : "neutral"}
              icon={<Sparkles className="size-4" />}
            />
            <StatCard label="Strong fits" value={strongMatches} tone={strongMatches ? "brand" : "neutral"} />
          </div>

          <Card>
            <CardHeader title="The brief" icon={<Target className="size-4" />} />
            <div className="mt-4">
              <DataList
                columns={1}
                items={[
                  {
                    label: "Budget",
                    value:
                      requirement.budgetMin || requirement.budgetMax
                        ? `${formatPrice(requirement.budgetMin ?? 0)} – ${formatPrice(requirement.budgetMax ?? 10000000)}`
                        : "Not specified",
                  },
                  { label: "Brand", value: requirement.make ?? "Any" },
                  { label: "Model", value: requirement.model ?? "Any" },
                  { label: "Body type", value: bodies.length ? bodies.join(", ") : "Any" },
                  { label: "Fuel", value: fuels.length ? fuels.join(", ") : "Any" },
                  { label: "Transmission", value: transmissions.length ? transmissions.join(", ") : "Any" },
                  { label: "Year", value: requirement.yearMin ? `${requirement.yearMin} or newer` : "Any" },
                  { label: "Kilometres", value: requirement.kmMax ? `Up to ${formatKm(requirement.kmMax)}` : "Any" },
                  {
                    label: "Ownership",
                    value: requirement.ownershipMax ? `${requirement.ownershipMax} or fewer` : "Any",
                  },
                  { label: "Colour", value: requirement.colour ?? "No preference" },
                  { label: "Branch", value: requirement.branch?.name ?? "Any branch" },
                  { label: "City", value: requirement.city ?? "Any", hidden: !requirement.city },
                  {
                    label: "Stops matching",
                    value: requirement.expiresAt ? formatDate(requirement.expiresAt) : "No end date",
                  },
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
                    href={`/customers/${requirement.customerId}`}
                    className="text-[12.5px] font-medium text-brand-700 hover:underline"
                  >
                    Full profile
                  </Link>
                ) : null
              }
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { k: "Enquiries", v: requirement.customer._count.leads },
                { k: "Test drives", v: requirement.customer._count.testDrives },
                { k: "Purchases", v: requirement.customer._count.sales },
              ].map((s) => (
                <div key={s.k}>
                  <p className="font-display text-[16px] font-semibold text-ink-950 tabular-nums">{s.v}</p>
                  <p className="text-[11px] text-ink-400">{s.k}</p>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
