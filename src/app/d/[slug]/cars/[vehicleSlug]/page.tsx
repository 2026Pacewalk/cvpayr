import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import {
  Gauge, Fuel, Settings2, Calendar, Users, MapPin, Palette,
  Check, ChevronRight, Phone, BadgeCheck, Info,
} from "lucide-react";
import { getDealerBySlug } from "@/server/dealer";
import {
  getVehicleDetail, similarVehicles, vehicleFeatures,
} from "@/server/inventory";
import { PUBLIC_VEHICLE_STATUSES, VEHICLE_STATUS_META, FEATURE_GROUPS, featureLabel, type VehicleStatus } from "@/lib/constants";
import {
  formatPrice, formatINR, formatKm, formatDate, vehicleTitle, vehicleSlug as makeSlug,
  stockIdFromSlug, telHref, daysBetween,
} from "@/lib/utils";
import { VehicleGallery } from "@/components/public/VehicleGallery";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import {
  WhatsAppCTA, ShareMenu, EnquireButton, StickyVehicleBar, EMICalculator,
} from "@/components/public/VehicleActions";
import { FavouriteButton, CompareButton } from "@/components/FavouriteButton";
import { VehicleRowCard } from "@/components/VehicleCard";
import { Badge, Card, DataList } from "@/components/ui/primitives";
import { TrackView } from "@/components/public/TrackView";

type Props = { params: Promise<{ slug: string; vehicleSlug: string }> };

async function load(slugParam: string, vehicleSlugParam: string) {
  const dealer = await getDealerBySlug(slugParam);
  if (!dealer) return null;
  const stockId = stockIdFromSlug(vehicleSlugParam);
  const vehicle = await getVehicleDetail(dealer.id, stockId);
  if (!vehicle) return null;
  // Draft / inactive / sold stock must never be reachable from the public site.
  if (!PUBLIC_VEHICLE_STATUSES.includes(vehicle.status as VehicleStatus)) return null;
  return { dealer, vehicle };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vehicleSlug } = await params;
  const data = await load(slug, vehicleSlug);
  if (!data) return { title: "Car not found" };

  const { dealer, vehicle } = data;
  const title = `${vehicleTitle(vehicle)} — ${formatPrice(vehicle.sellingPrice)}`;
  const description = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.variant ?? ""} for sale at ${dealer.name}, ${vehicle.branch.city}. ${formatKm(vehicle.kmDriven)}, ${vehicle.fuelType}, ${vehicle.transmission}, ${vehicle.ownership} owner. ${vehicle.description?.slice(0, 90) ?? ""}`.trim();

  return {
    title,
    description,
    alternates: { canonical: `/d/${dealer.slug}/cars/${makeSlug(vehicle)}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: vehicle.images[0] ? [vehicle.images[0].url] : undefined,
    },
  };
}

export default async function VehicleDetailPage({ params }: Props) {
  const { slug, vehicleSlug } = await params;
  const data = await load(slug, vehicleSlug);
  if (!data) notFound();

  const { dealer, vehicle } = data;
  const base = `/d/${dealer.slug}`;
  const title = vehicleTitle(vehicle);
  const status = VEHICLE_STATUS_META[vehicle.status as VehicleStatus];
  const features = vehicleFeatures(vehicle);
  const similar = await similarVehicles(vehicle);
  const canonical = `${base}/cars/${makeSlug(vehicle)}`;

  const whatsappMessage = `Hi ${dealer.name}, I am interested in the ${title} listed on your website (Stock ID: ${vehicle.stockId}). Is this vehicle still available?`;

  const qrDataUrl = await QRCode.toDataURL(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${canonical}`,
    { width: 200, margin: 1, color: { dark: "#141b27", light: "#ffffff" } },
  ).catch(() => null);

  const enquiryProps = {
    dealerSlug: dealer.slug,
    vehicleId: vehicle.id,
    branchId: vehicle.branchId,
    defaultMessage: `I am interested in the ${title} (${vehicle.stockId}).`,
  };

  const daysListed = daysBetween(vehicle.listedAt ?? vehicle.createdAt);

  // Structured data helps this page surface as a rich result.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: title,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleConfiguration: vehicle.variant ?? undefined,
    productionDate: String(vehicle.year),
    color: vehicle.colour ?? undefined,
    fuelType: vehicle.fuelType,
    vehicleTransmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: vehicle.kmDriven, unitCode: "KMT" },
    numberOfPreviousOwners: vehicle.ownership,
    image: vehicle.images.filter((i) => i.kind === "photo").map((i) => i.url),
    description: vehicle.description ?? undefined,
    offers: {
      "@type": "Offer",
      price: vehicle.sellingPrice,
      priceCurrency: "INR",
      availability:
        vehicle.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/LimitedAvailability",
      seller: { "@type": "AutoDealer", name: dealer.name, telephone: dealer.phone ?? undefined },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TrackView vehicleId={vehicle.id} />

      <div className="mx-auto max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-8 lg:pb-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="no-print mb-4 flex flex-wrap items-center gap-1 text-[12.5px] text-ink-500">
          <Link href={base} className="hover:text-ink-800">Home</Link>
          <ChevronRight className="size-3.5 text-ink-300" />
          <Link href={`${base}/cars`} className="hover:text-ink-800">Cars</Link>
          <ChevronRight className="size-3.5 text-ink-300" />
          <Link href={`${base}/cars?make=${encodeURIComponent(vehicle.make)}`} className="hover:text-ink-800">
            {vehicle.make}
          </Link>
          <ChevronRight className="size-3.5 text-ink-300" />
          <span className="truncate text-ink-800">{vehicle.model}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
          {/* ─────────────────────── LEFT COLUMN ─────────────────────── */}
          <div className="min-w-0">
            <VehicleGallery
              media={vehicle.images.map((i) => ({
                id: i.id, url: i.url, kind: i.kind, caption: i.caption,
              }))}
              title={title}
              status={vehicle.status !== "available" ? { label: status.label, tone: status.tone } : null}
            />

            {/* Title block — mobile order puts it under the gallery */}
            <div className="mt-6 lg:hidden">
              <TitleBlock
                vehicle={vehicle}
                title={title}
                statusLabel={status.label}
                statusTone={status.tone}
              />
            </div>

            {/* Key specs */}
            <section className="mt-6">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-ink-200 bg-ink-200 sm:grid-cols-4">
                {[
                  { icon: Calendar, label: "Year", value: String(vehicle.year) },
                  { icon: Gauge, label: "Kilometres", value: formatKm(vehicle.kmDriven) },
                  { icon: Fuel, label: "Fuel", value: vehicle.fuelType },
                  { icon: Settings2, label: "Transmission", value: vehicle.transmission },
                ].map((s) => (
                  <div key={s.label} className="bg-white px-4 py-3.5">
                    <s.icon className="size-4 text-ink-400" />
                    <p className="field-label mt-2">{s.label}</p>
                    <p className="mt-0.5 text-[13.5px] font-semibold text-ink-900">{s.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Description */}
            {vehicle.description && (
              <section className="mt-6">
                <h2 className="font-display text-[17px] font-semibold text-ink-950">
                  About this car
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line text-ink-600">
                  {vehicle.description}
                </p>
              </section>
            )}

            {/* Specifications */}
            <section className="mt-8 print-break">
              <h2 className="font-display text-[17px] font-semibold text-ink-950">Specifications</h2>
              <Card className="mt-3">
                <DataList
                  columns={3}
                  items={[
                    { label: "Stock ID", value: <span className="font-mono">{vehicle.stockId}</span> },
                    { label: "Make & Model", value: `${vehicle.make} ${vehicle.model}` },
                    { label: "Variant", value: vehicle.variant ?? "-" },
                    { label: "Manufacturing year", value: String(vehicle.year) },
                    { label: "Registration year", value: String(vehicle.registrationYear ?? vehicle.year) },
                    { label: "Body type", value: vehicle.bodyType },
                    { label: "Fuel type", value: vehicle.fuelType },
                    { label: "Transmission", value: vehicle.transmission },
                    { label: "Kilometres driven", value: formatKm(vehicle.kmDriven) },
                    { label: "Ownership", value: `${vehicle.ownership}${vehicle.ownership === 1 ? "st" : vehicle.ownership === 2 ? "nd" : vehicle.ownership === 3 ? "rd" : "th"} owner` },
                    { label: "Colour", value: vehicle.colour ?? "-" },
                    { label: "Registration state", value: vehicle.registrationState ?? "-" },
                    { label: "RTO", value: vehicle.rto ?? "-" },
                    {
                      label: "Insurance",
                      value: vehicle.insuranceStatus
                        ? `${vehicle.insuranceStatus.replace(/_/g, " ")}${vehicle.insuranceValidTill ? ` · valid to ${formatDate(vehicle.insuranceValidTill)}` : ""}`
                        : "-",
                    },
                    { label: "Number of keys", value: String(vehicle.numberOfKeys) },
                  ]}
                />
              </Card>
            </section>

            {/* Condition */}
            <section className="mt-8 print-break">
              <h2 className="font-display text-[17px] font-semibold text-ink-950">
                Condition report
              </h2>
              <Card className="mt-3">
                <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 pb-4">
                  {vehicle.conditionRating != null && (
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-11 items-center justify-center rounded-[10px] bg-success-50 font-display text-[16px] font-semibold text-success-700">
                        {vehicle.conditionRating.toFixed(1)}
                      </span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-ink-900">Overall condition</p>
                        <p className="text-[12px] text-ink-500">Assessed on our 140-point checklist</p>
                      </div>
                    </div>
                  )}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {!vehicle.accidental && <Badge tone="success" dot>Non-accidental</Badge>}
                    {!vehicle.floodDamaged && <Badge tone="success" dot>No flood damage</Badge>}
                    {vehicle.rcAvailable && <Badge tone="info" dot>RC available</Badge>}
                    {vehicle.serviceRecordsAvailable && <Badge tone="info" dot>Service records</Badge>}
                  </div>
                </div>
                <div className="pt-4">
                  <DataList
                    columns={3}
                    items={[
                      { label: "Service history", value: vehicle.serviceHistory ? vehicle.serviceHistory.replace(/_/g, " ") : "-" },
                      { label: "Repainted panels", value: vehicle.repaintedPanels === 0 ? "None — original paint" : `${vehicle.repaintedPanels} panel(s)` },
                      { label: "Engine", value: vehicle.engineCondition ?? "-" },
                      { label: "Tyres", value: vehicle.tyreCondition ?? "-" },
                      { label: "Battery", value: vehicle.batteryCondition ?? "-" },
                      { label: "Interior", value: vehicle.interiorCondition ?? "-" },
                      { label: "Exterior", value: vehicle.exteriorCondition ?? "-" },
                      { label: "Fitness valid till", value: formatDate(vehicle.fitnessValidTill) },
                      { label: "PUC valid till", value: formatDate(vehicle.pucValidTill) },
                    ]}
                  />
                </div>
              </Card>
            </section>

            {/* Features */}
            {features.length > 0 && (
              <section className="mt-8 print-break">
                <h2 className="font-display text-[17px] font-semibold text-ink-950">
                  Features & equipment
                </h2>
                <Card className="mt-3">
                  <div className="grid gap-6 sm:grid-cols-2">
                    {FEATURE_GROUPS.map((group) => {
                      const present = group.features.filter((f) => features.includes(f.key));
                      if (!present.length) return null;
                      return (
                        <div key={group.group}>
                          <p className="field-label">{group.group}</p>
                          <ul className="mt-2.5 space-y-1.5">
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
                          <ul className="mt-2.5 space-y-1.5">
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
              </section>
            )}

            {/* Branch */}
            <section className="mt-8">
              <h2 className="font-display text-[17px] font-semibold text-ink-950">
                Where to see this car
              </h2>
              <Card className="mt-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink-950">{vehicle.branch.name}</h3>
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-500">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                      {[vehicle.branch.addressLine, vehicle.branch.city, vehicle.branch.state, vehicle.branch.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {vehicle.branch.openingHours && (
                      <p className="mt-1.5 text-[12.5px] text-ink-500">{vehicle.branch.openingHours}</p>
                    )}
                  </div>
                  {qrDataUrl && (
                    <div className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR code to this listing" className="size-24 rounded-[8px] border border-ink-200" />
                      <p className="mt-1.5 text-[11px] text-ink-400">Scan for this car</p>
                    </div>
                  )}
                </div>
                <div className="no-print mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
                  {vehicle.branch.phone && (
                    <a
                      href={telHref(vehicle.branch.phone)}
                      className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800"
                    >
                      <Phone className="size-4" />
                      Call {vehicle.branch.city}
                    </a>
                  )}
                  {vehicle.branch.whatsapp && (
                    <WhatsAppCTA
                      phone={vehicle.branch.whatsapp}
                      message={whatsappMessage}
                      dealerSlug={dealer.slug}
                      vehicleId={vehicle.id}
                      className="h-10 text-[13px]"
                    />
                  )}
                  <Link
                    href={`${base}/cars?branch=${vehicle.branchId}`}
                    className="inline-flex h-10 items-center rounded-[10px] border border-ink-200 px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
                  >
                    More cars here
                  </Link>
                </div>
              </Card>
            </section>
          </div>

          {/* ─────────────────────── RIGHT COLUMN ────────────────────── */}
          <aside className="min-w-0">
            <div className="lg:sticky lg:top-20 lg:space-y-4">
              <div className="hidden lg:block">
                <Card>
                  <TitleBlock
                    vehicle={vehicle}
                    title={title}
                    statusLabel={status.label}
                    statusTone={status.tone}
                  />
                  <div className="no-print mt-5 space-y-2.5">
                    <EnquireButton
                      {...enquiryProps}
                      label="Enquire now"
                      fullWidth
                      sheetTitle={`Enquire about ${title}`}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      {dealer.whatsapp && (
                        <WhatsAppCTA
                          phone={vehicle.branch.whatsapp ?? dealer.whatsapp}
                          message={whatsappMessage}
                          dealerSlug={dealer.slug}
                          vehicleId={vehicle.id}
                        />
                      )}
                      {(vehicle.branch.phone ?? dealer.phone) && (
                        <a
                          href={telHref(vehicle.branch.phone ?? dealer.phone)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[14px] font-medium text-white hover:bg-ink-800"
                        >
                          <Phone className="size-4" />
                          Call
                        </a>
                      )}
                    </div>
                    <EnquireButton
                      {...enquiryProps}
                      mode="test_drive"
                      label="Book a test drive"
                      variant="outline"
                      fullWidth
                      sheetTitle="Book a test drive"
                    />
                    <div className="flex gap-2.5">
                      <FavouriteButton vehicleId={vehicle.id} variant="inline" className="flex-1" />
                      <CompareButton vehicleId={vehicle.id} className="flex-1" />
                    </div>
                    <ShareMenu title={title} className="w-full [&>button]:w-full" />
                  </div>
                </Card>
              </div>

              <EMICalculator price={vehicle.sellingPrice} />

              <Card className="no-print">
                <EnquiryForm
                  {...enquiryProps}
                  compact
                  branches={dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }))}
                  title="Request a callback"
                  description="Leave your number — we will call you back."
                  mode="callback"
                />
              </Card>

              <div className="rounded-[14px] border border-ink-200 bg-ink-50 p-4">
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-500">
                  <Info className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  Listed {daysListed === 0 ? "today" : `${daysListed} day${daysListed === 1 ? "" : "s"} ago`}
                  {vehicle.negotiable && " · Price negotiable"}
                  {vehicle.viewCount > 20 && ` · ${vehicle.viewCount} people viewed this car`}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <section className="no-print mt-12">
            <h2 className="font-display text-[19px] font-semibold text-ink-950">Similar cars</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {similar.map((v) => (
                <VehicleRowCard key={v.id} vehicle={v} href={`${base}/cars/${makeSlug(v)}`} />
              ))}
            </div>
          </section>
        )}
      </div>

      <StickyVehicleBar
        price={vehicle.sellingPrice}
        phone={vehicle.branch.phone ?? dealer.phone}
        whatsapp={vehicle.branch.whatsapp ?? dealer.whatsapp}
        message={whatsappMessage}
        dealerSlug={dealer.slug}
        vehicleId={vehicle.id}
        enquiryProps={enquiryProps}
      />
    </>
  );
}

function TitleBlock({
  vehicle,
  title,
  statusLabel,
  statusTone,
}: {
  vehicle: {
    year: number; make: string; model: string; variant: string | null; stockId: string;
    sellingPrice: number; originalPrice: number | null; negotiable: boolean;
    kmDriven: number; ownership: number; colour: string | null; status: string;
    branch: { name: string; city: string };
  };
  title: string;
  statusLabel: string;
  statusTone: React.ComponentProps<typeof Badge>["tone"];
}) {
  const saving =
    vehicle.originalPrice && vehicle.originalPrice > vehicle.sellingPrice
      ? vehicle.originalPrice - vehicle.sellingPrice
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone} dot>{statusLabel}</Badge>
        <span className="font-mono text-[11.5px] text-ink-400">{vehicle.stockId}</span>
        {vehicle.ownership === 1 && (
          <Badge tone="info" size="sm">
            <BadgeCheck className="size-3" />
            First owner
          </Badge>
        )}
      </div>

      <h1 className="mt-2.5 font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
        {vehicle.year} {vehicle.make} {vehicle.model}
      </h1>
      {vehicle.variant && <p className="mt-1 text-[14px] text-ink-500">{vehicle.variant}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="font-display text-[28px] leading-none font-semibold text-ink-950">
          {formatPrice(vehicle.sellingPrice)}
        </p>
        {saving && (
          <p className="text-[13px] text-ink-400">
            <span className="line-through">{formatPrice(vehicle.originalPrice)}</span>{" "}
            <span className="font-medium text-success-700">save {formatPrice(saving)}</span>
          </p>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {formatINR(vehicle.sellingPrice)}
        {vehicle.negotiable && " · Negotiable"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-4 text-[12.5px] text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="size-3.5 text-ink-400" />
          {formatKm(vehicle.kmDriven)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5 text-ink-400" />
          {vehicle.ownership} owner
        </span>
        {vehicle.colour && (
          <span className="inline-flex items-center gap-1.5">
            <Palette className="size-3.5 text-ink-400" />
            {vehicle.colour}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 text-ink-400" />
          {vehicle.branch.city}
        </span>
      </div>
    </div>
  );
}
