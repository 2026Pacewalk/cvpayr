import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft, Pencil, ExternalLink, Star, Users, Eye, Clock3, MapPin,
  Check, IndianRupee, ClipboardCheck, Handshake, Copy, Sparkles, MessageCircle,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeCost, canSeeMargin, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getVehicleDetail, vehicleFeatures, vehicleMargin, ageingDays } from "@/server/inventory";
import { getDealerBranches } from "@/server/dealer";
import { matchRequirementsForVehicle } from "@/server/matching";
import { db } from "@/lib/db";
import { VehicleGallery } from "@/components/public/VehicleGallery";
import { VehicleStatusBar } from "@/components/crm/VehicleStatusBar";
import { Card, CardHeader, Badge, DataList, StatCard, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import {
  formatPrice, formatINR, formatKm, formatDate, relativeTime, vehicleTitle,
  vehicleSlug, daysBetween, whatsappHref,
} from "@/lib/utils";
import {
  VEHICLE_STATUS_META, FEATURE_GROUPS, featureLabel, ageingBucket,
  LEAD_STAGE_META, type VehicleStatus, type LeadStage,
} from "@/lib/constants";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireDealerUser();
  const vehicle = await getVehicleDetail(user.dealerId, id);
  return { title: vehicle ? `${vehicle.stockId} · ${vehicleTitle(vehicle)}` : "Vehicle" };
}

export default async function VehicleDetailPage({ params, searchParams }: Props) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.INVENTORY_VIEW)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const vehicle = await getVehicleDetail(user.dealerId, id);
  if (!vehicle) notFound();
  if (!isBranchAllowed(user, vehicle.branchId)) redirect("/inventory");

  const [branches, leads, transfers, requirementMatches] = await Promise.all([
    getDealerBranches(user.dealerId, true),
    can(user, PERMISSIONS.LEADS_VIEW)
      ? db.lead.findMany({
          where: {
            vehicleId: vehicle.id,
            ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
          },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            customer: { select: { name: true, phone: true } },
            owner: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    db.branchTransfer.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { createdAt: "desc" },
    }),
    can(user, PERMISSIONS.LEADS_VIEW)
      ? matchRequirementsForVehicle(vehicle, user.dealerId, {
          limit: 12,
          branchIds: user.branchIds,
        })
      : Promise.resolve([]),
  ]);

  const matches = requirementMatches;

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const status = VEHICLE_STATUS_META[vehicle.status as VehicleStatus];
  const features = vehicleFeatures(vehicle);
  const showCost = canSeeCost(user);
  const showMargin = canSeeMargin(user);
  const margin = showMargin ? vehicleMargin(vehicle) : null;
  const days = ageingDays(vehicle);
  const bucket = ageingBucket(days);
  const sale = vehicle.sales[0];
  const activeBooking = vehicle.bookings.find((b) => b.status === "active");

  const publicUrl = user.dealerSlug ? `/d/${user.dealerSlug}/cars/${vehicleSlug(vehicle)}` : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/inventory"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to inventory
      </Link>

      {sp.created && <Alert tone="success" title="Vehicle added" className="mb-4">It is now part of your inventory.</Alert>}
      {sp.updated && <Alert tone="success" title="Changes saved" className="mb-4">Your website has been updated.</Alert>}
      {sp.cloned && <Alert tone="info" title="Duplicated" className="mb-4">Review the details and publish when ready.</Alert>}

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-ink-400">{vehicle.stockId}</span>
            <Badge tone={status.tone} dot>{status.label}</Badge>
            {vehicle.isFeatured && (
              <Badge tone="warning" size="sm">
                <Star className="size-3 fill-current" />
                Featured
              </Badge>
            )}
            <Badge tone={bucket.tone} size="sm">{days} days in stock</Badge>
          </div>
          <h1 className="mt-2 font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
            {vehicleTitle(vehicle)}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {vehicle.branch.name}
            </span>
            {vehicle.registrationNumber && <span>Reg. {vehicle.registrationNumber}</span>}
            <span>Added {relativeTime(vehicle.createdAt)}</span>
            {vehicle.createdBy && <span>by {vehicle.createdBy.name}</span>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {publicUrl && status.publicVisible && (
            <LinkButton href={publicUrl} target="_blank" variant="outline" size="sm">
              <ExternalLink className="size-4" />
              View live
            </LinkButton>
          )}
          {can(user, PERMISSIONS.INVENTORY_EDIT) && (
            <LinkButton href={`/inventory/${vehicle.id}/edit`} size="sm">
              <Pencil className="size-4" />
              Edit
            </LinkButton>
          )}
        </div>
      </div>

      {/* Status / actions bar */}
      <VehicleStatusBar
        vehicleId={vehicle.id}
        stockId={vehicle.stockId}
        title={vehicleTitle(vehicle)}
        status={vehicle.status}
        isFeatured={vehicle.isFeatured}
        branchId={vehicle.branchId}
        branchName={vehicle.branch.name}
        branches={branches.map((b) => ({ id: b.id, name: b.name, city: b.city }))}
        sellingPrice={vehicle.sellingPrice}
        canEdit={can(user, PERMISSIONS.INVENTORY_EDIT)}
        canTransfer={can(user, PERMISSIONS.INVENTORY_TRANSFER)}
        canDelete={can(user, PERMISSIONS.INVENTORY_DELETE)}
        canCreate={can(user, PERMISSIONS.INVENTORY_CREATE)}
        canSell={can(user, PERMISSIONS.SALES_MANAGE)}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {vehicle.images.length > 0 ? (
            <VehicleGallery
              media={vehicle.images.map((i) => ({ id: i.id, url: i.url, kind: i.kind, caption: i.caption }))}
              title={vehicleTitle(vehicle)}
              status={{ label: status.label, tone: status.tone }}
            />
          ) : (
            <EmptyState
              title="No photos yet"
              description="Vehicles with 8 or more photos get far more enquiries."
              action={
                can(user, PERMISSIONS.INVENTORY_EDIT) ? (
                  <LinkButton href={`/inventory/${vehicle.id}/edit`} size="sm">Add photos</LinkButton>
                ) : null
              }
            />
          )}

          {/* Commercials */}
          <Card>
            <CardHeader
              title="Pricing"
              icon={<IndianRupee className="size-4" />}
              description={vehicle.negotiable ? "Marked negotiable on your website" : "Fixed price"}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="field-label">Selling price</p>
                <p className="mt-1 font-display text-[20px] font-semibold text-ink-950">
                  {formatPrice(vehicle.sellingPrice)}
                </p>
                <p className="text-[11.5px] text-ink-400">{formatINR(vehicle.sellingPrice)}</p>
              </div>
              {vehicle.originalPrice && (
                <div>
                  <p className="field-label">Original price</p>
                  <p className="mt-1 text-[16px] font-semibold text-ink-700">
                    {formatPrice(vehicle.originalPrice)}
                  </p>
                  <p className="text-[11.5px] text-success-700">
                    Customer saves {formatPrice(vehicle.originalPrice - vehicle.sellingPrice)}
                  </p>
                </div>
              )}
              {showCost && vehicle.minAcceptablePrice && (
                <div>
                  <p className="field-label">Minimum acceptable</p>
                  <p className="mt-1 text-[16px] font-semibold text-warning-700">
                    {formatPrice(vehicle.minAcceptablePrice)}
                  </p>
                  <p className="text-[11.5px] text-ink-400">Private — your walk-away number</p>
                </div>
              )}
            </div>

            {showCost && (
              <div className="mt-5 rounded-[12px] border border-warning-100 bg-warning-50/60 p-4">
                <p className="field-label mb-3 text-warning-700">Private commercials</p>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <p className="field-label">Purchase cost</p>
                    <p className="mt-1 text-[15px] font-semibold text-ink-900">
                      {formatPrice(vehicle.purchasePrice)}
                    </p>
                  </div>
                  <div>
                    <p className="field-label">Refurbishment</p>
                    <p className="mt-1 text-[15px] font-semibold text-ink-900">
                      {formatPrice(vehicle.refurbishmentCost)}
                    </p>
                  </div>
                  {margin && (
                    <>
                      <div>
                        <p className="field-label">Projected profit</p>
                        <p
                          className={`mt-1 text-[15px] font-semibold ${margin.profit >= 0 ? "text-success-700" : "text-danger-600"}`}
                        >
                          {formatPrice(margin.profit)}
                        </p>
                      </div>
                      <div>
                        <p className="field-label">Margin</p>
                        <p
                          className={`mt-1 text-[15px] font-semibold ${margin.profit >= 0 ? "text-success-700" : "text-danger-600"}`}
                        >
                          {margin.marginPct}%
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {vehicle.internalNotes && (
                  <p className="mt-4 border-t border-warning-100 pt-3 text-[12.5px] leading-relaxed text-ink-600">
                    <span className="font-semibold">Internal note: </span>
                    {vehicle.internalNotes}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Specs */}
          <Card>
            <CardHeader title="Specifications" />
            <div className="mt-4">
              <DataList
                columns={4}
                items={[
                  { label: "Year", value: vehicle.year },
                  { label: "Registration year", value: vehicle.registrationYear ?? "-" },
                  { label: "Fuel", value: vehicle.fuelType },
                  { label: "Transmission", value: vehicle.transmission },
                  { label: "Body type", value: vehicle.bodyType },
                  { label: "Colour", value: vehicle.colour ?? "-" },
                  { label: "Kilometres", value: formatKm(vehicle.kmDriven) },
                  { label: "Ownership", value: `${vehicle.ownership} owner` },
                  { label: "Reg. state", value: vehicle.registrationState ?? "-" },
                  { label: "RTO", value: vehicle.rto ?? "-" },
                  { label: "Insurance", value: vehicle.insuranceStatus?.replace(/_/g, " ") ?? "-" },
                  { label: "Insurance till", value: formatDate(vehicle.insuranceValidTill) },
                  { label: "Fitness till", value: formatDate(vehicle.fitnessValidTill) },
                  { label: "PUC till", value: formatDate(vehicle.pucValidTill) },
                  { label: "Keys", value: vehicle.numberOfKeys },
                  { label: "Listed on", value: formatDate(vehicle.listedAt ?? vehicle.createdAt) },
                ]}
              />
            </div>
          </Card>

          {/* Condition */}
          <Card>
            <CardHeader title="Condition" icon={<ClipboardCheck className="size-4" />} />
            <div className="mt-4 flex flex-wrap gap-2">
              {vehicle.conditionRating != null && (
                <Badge tone="success">{vehicle.conditionRating.toFixed(1)} / 5 overall</Badge>
              )}
              <Badge tone={vehicle.accidental ? "danger" : "success"} dot>
                {vehicle.accidental ? "Accident history" : "Non-accidental"}
              </Badge>
              <Badge tone={vehicle.floodDamaged ? "danger" : "success"} dot>
                {vehicle.floodDamaged ? "Flood damaged" : "No flood damage"}
              </Badge>
              <Badge tone={vehicle.rcAvailable ? "info" : "neutral"} dot>
                RC {vehicle.rcAvailable ? "available" : "missing"}
              </Badge>
              <Badge tone={vehicle.serviceRecordsAvailable ? "info" : "neutral"} dot>
                Service records {vehicle.serviceRecordsAvailable ? "available" : "missing"}
              </Badge>
            </div>
            <div className="mt-4">
              <DataList
                columns={4}
                items={[
                  { label: "Service history", value: vehicle.serviceHistory?.replace(/_/g, " ") ?? "-" },
                  { label: "Repainted panels", value: vehicle.repaintedPanels || "None" },
                  { label: "Engine", value: vehicle.engineCondition ?? "-" },
                  { label: "Tyres", value: vehicle.tyreCondition ?? "-" },
                  { label: "Battery", value: vehicle.batteryCondition ?? "-" },
                  { label: "Interior", value: vehicle.interiorCondition ?? "-" },
                  { label: "Exterior", value: vehicle.exteriorCondition ?? "-" },
                ]}
              />
            </div>
          </Card>

          {/* Features */}
          {features.length > 0 && (
            <Card>
              <CardHeader title={`Features (${features.length})`} />
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {FEATURE_GROUPS.map((group) => {
                  const present = group.features.filter((f) => features.includes(f.key));
                  if (!present.length) return null;
                  return (
                    <div key={group.group}>
                      <p className="field-label">{group.group}</p>
                      <ul className="mt-2 space-y-1">
                        {present.map((f) => (
                          <li key={f.key} className="flex items-center gap-2 text-[13px] text-ink-700">
                            <Check className="size-3.5 shrink-0 text-success-600" />
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {(() => {
                  const known = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.key));
                  const custom = features.filter((f) => !known.includes(f));
                  if (!custom.length) return null;
                  return (
                    <div>
                      <p className="field-label">Additional</p>
                      <ul className="mt-2 space-y-1">
                        {custom.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-[13px] text-ink-700">
                            <Check className="size-3.5 shrink-0 text-success-600" />
                            {featureLabel(f)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </Card>
          )}

          {can(user, PERMISSIONS.LEADS_VIEW) && (
            <Card padded={false} id="matches">
              <div className="p-4 sm:p-5">
                <CardHeader
                  title={
                    matches.length
                      ? `${matches.length} customer${matches.length === 1 ? "" : "s"} may want this car`
                      : "No open requirements match this car"
                  }
                  description={
                    matches.length
                      ? "Recorded briefs this car satisfies — highest priority first."
                      : "When a customer describes something like this, record it and matches appear here."
                  }
                  icon={<Sparkles className="size-4" />}
                  action={
                    <Link
                      href="/requirements"
                      className="text-[12.5px] font-medium text-brand-700 hover:text-brand-800"
                    >
                      All requirements
                    </Link>
                  }
                />

                {matches.length ? (
                  <div className="mt-4 space-y-2">
                    {matches.map((m) => (
                      <div
                        key={m.requirement.id}
                        className="flex flex-wrap items-center gap-3 rounded-[10px] border border-ink-200 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/requirements/${m.requirement.id}`}
                              className="text-[13.5px] font-semibold text-ink-950 hover:text-brand-700"
                            >
                              {m.requirement.customer.name}
                            </Link>
                            {m.requirement.priority === "high" && (
                              <Badge tone="danger" size="sm">High priority</Badge>
                            )}
                            <Badge tone={m.score >= 80 ? "success" : "neutral"} size="sm">
                              {m.score}% fit
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-ink-400">
                            {m.requirement.customer.phone}
                            {m.requirement.createdBy && ` · brief by ${m.requirement.createdBy.name}`}
                            {` · ${relativeTime(m.requirement.createdAt)}`}
                          </p>
                        </div>
                        <a
                          href={whatsappHref(
                            m.requirement.customer.phone,
                            `Hi ${m.requirement.customer.name.split(" ")[0]}, we just got a ${vehicleTitle(vehicle)} that matches what you were looking for. Shall I share the details?`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-success-600 px-3 text-[12.5px] font-medium text-white hover:bg-success-700"
                        >
                          <MessageCircle className="size-4" />
                          Tell them
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-ink-500">
                    Nothing to act on right now.
                  </p>
                )}
              </div>
            </Card>
          )}

          {vehicle.description && (
            <Card>
              <CardHeader title="Public description" />
              <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-600">
                {vehicle.description}
              </p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Enquiries" value={vehicle.enquiryCount} icon={<Users className="size-4" />} tone="brand" />
            <StatCard label="Page views" value={vehicle.viewCount} icon={<Eye className="size-4" />} tone="info" />
            <StatCard label="Days in stock" value={days} icon={<Clock3 className="size-4" />} tone={bucket.tone} />
            <StatCard label="Test drives" value={vehicle._count.testDrives} tone="purple" />
          </div>

          {sale && (
            <Card>
              <CardHeader title="Sale record" icon={<Handshake className="size-4" />} />
              <div className="mt-4">
                <DataList
                  columns={1}
                  items={[
                    { label: "Reference", value: sale.reference },
                    { label: "Customer", value: sale.customer.name },
                    { label: "Sale price", value: formatPrice(sale.salePrice) },
                    { label: "Sold on", value: formatDate(sale.soldAt) },
                    { label: "Sales executive", value: sale.salesExecutive?.name ?? "-" },
                    { label: "Payment", value: sale.paymentMode ?? "-" },
                    { label: "Gross profit", value: formatPrice(sale.grossProfit), hidden: !showMargin },
                  ]}
                />
              </div>
            </Card>
          )}

          {activeBooking && (
            <Card>
              <CardHeader title="Active booking" />
              <div className="mt-4">
                <DataList
                  columns={1}
                  items={[
                    { label: "Reference", value: activeBooking.reference },
                    { label: "Customer", value: activeBooking.customer.name },
                    { label: "Token received", value: formatPrice(activeBooking.bookingAmount) },
                    { label: "Agreed price", value: formatPrice(activeBooking.agreedPrice) },
                    { label: "Booked on", value: formatDate(activeBooking.bookedAt) },
                    { label: "Payment status", value: activeBooking.paymentStatus },
                  ]}
                />
              </div>
            </Card>
          )}

          {can(user, PERMISSIONS.LEADS_VIEW) && (
            <Card padded={false}>
              <div className="p-4">
                <CardHeader
                  title="Linked leads"
                  description={`${vehicle._count.leads} enquir${vehicle._count.leads === 1 ? "y" : "ies"}`}
                />
              </div>
              {leads.length ? (
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {leads.map((l) => {
                    const stage = LEAD_STAGE_META[l.stage as LeadStage];
                    return (
                      <li key={l.id}>
                        <Link href={`/leads/${l.id}`} className="block p-3.5 hover:bg-ink-50">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-medium text-ink-900">
                              {l.customer.name}
                            </p>
                            <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-ink-400">
                            {l.reference} · {relativeTime(l.createdAt)}
                            {l.owner && ` · ${l.owner.name.split(" ")[0]}`}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="border-t border-ink-100 p-4">
                  <p className="text-[13px] text-ink-500">No enquiries on this vehicle yet.</p>
                </div>
              )}
            </Card>
          )}

          {transfers.length > 0 && (
            <Card>
              <CardHeader title="Transfer history" />
              <ul className="mt-3 space-y-3">
                {transfers.map((t) => (
                  <li key={t.id} className="text-[12.5px]">
                    <p className="text-ink-700">
                      {branchNames.get(t.fromBranchId) ?? "Branch"} →{" "}
                      <span className="font-medium text-ink-900">
                        {branchNames.get(t.toBranchId) ?? "Branch"}
                      </span>
                    </p>
                    <p className="text-ink-400">{formatDate(t.createdAt)}</p>
                    {t.note && <p className="mt-0.5 text-ink-500">{t.note}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {publicUrl && (
            <Card>
              <CardHeader title="Public listing" icon={<Copy className="size-4" />} />
              <p className="mt-3 rounded-[8px] bg-ink-50 px-3 py-2 font-mono text-[11.5px] break-all text-ink-600">
                {publicUrl}
              </p>
              <p className="mt-2 text-[12px] text-ink-400">
                {status.publicVisible
                  ? "This vehicle is live on your website."
                  : `Not visible publicly — status is ${status.label.toLowerCase()}.`}
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
