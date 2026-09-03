import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, ShieldCheck, FileCheck2, Wallet, Repeat, Star, MapPin,
  Phone, MessageCircle, Car, Sparkles,
} from "lucide-react";
import {
  getDealerBySlug, getDealerStats, getPublishedTestimonials,
  getPopularBrands, getBodyTypeCounts, dealerWhyChooseUs, dealerWorkingHours,
} from "@/server/dealer";
import { listVehicles, vehicleFacets } from "@/server/inventory";
import { PublicVehicleCard } from "@/components/VehicleCard";
import { ShowroomHero } from "@/components/public/ShowroomHero";
import { EmptyState } from "@/components/ui/primitives";
import { PRICE_BUCKETS } from "@/lib/constants";
import { resolveTemplate, type TemplateDefinition } from "@/lib/templates";
import { formatPrice, whatsappHref, telHref, vehicleSlug, cn } from "@/lib/utils";
import { ShowroomFaq } from "@/components/public/ShowroomFaq";
import { JsonLd } from "@/components/JsonLd";
import { showroomFaq } from "@/lib/faq";
import { faqSchema } from "@/lib/seo";

const ICONS: Record<string, typeof ShieldCheck> = {
  shield: ShieldCheck,
  file: FileCheck2,
  wallet: Wallet,
  repeat: Repeat,
};

/**
 * The canonical is set here rather than in the layout: metadata inherits down,
 * so a canonical on the layout would point every page of the showroom — cars,
 * about, contact — back at the home page and collapse them out of the index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { alternates: { canonical: `/d/${slug}` } };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;

  return {
    // absolute, so the root layout's "%s · CarVyapar" template does not brand
    // a dealer's own storefront with the platform's name.
    title: {
      absolute:
        dealer.websiteSettings?.metaTitle ??
        `${dealer.name} — Used Cars${city ? ` in ${city}` : ""}`,
    },
    alternates: { canonical: `/d/${slug}` },
  };
}

export default async function DealerHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const base = `/d/${dealer.slug}`;
  const opts = { dealerId: dealer.id, publicOnly: true as const };

  const [featured, recent, stats, testimonials, brands, bodyTypes, facets] = await Promise.all([
    listVehicles({ featured: true, sort: "newest" }, { ...opts, pageSize: 8 }),
    listVehicles({ sort: "newest" }, { ...opts, pageSize: 8 }),
    getDealerStats(dealer.id),
    getPublishedTestimonials(dealer.id),
    getPopularBrands(dealer.id),
    getBodyTypeCounts(dealer.id),
    vehicleFacets(opts),
  ]);

  const why = dealerWhyChooseUs(dealer);
  const settings = dealer.websiteSettings;
  const template = resolveTemplate(settings?.template);
  const heroCars = featured.items.length >= 4 ? featured.items : recent.items;

  // Answered from this dealership's own record, so a question only appears when
  // the data behind it does.
  const faq = showroomFaq(
    { ...dealer, websiteSettings: settings ?? null },
    { hours: dealerWorkingHours(dealer), stock: stats.available, brands, since: stats.since },
  );

  return (
    <>
      <JsonLd nodes={[faqSchema(faq)]} />

      <ShowroomHero
        template={template}
        base={base}
        dealerName={dealer.name}
        headline={settings?.heroHeadline ?? "Find your next car, without the guesswork"}
        subheadline={
          settings?.heroSubheadline ??
          dealer.tagline ??
          "Inspected, fairly priced pre-owned cars with paperwork you can verify."
        }
        heroImage={settings?.heroImageUrl ?? dealer.coverUrl ?? heroCars[0]?.images[0]?.url ?? null}
        stats={stats}
        search={{
          makes: facets.makes,
          fuels: facets.fuels,
          branches: dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city })),
          priceMax: facets.priceMax,
        }}
      />

      {/* ─────────────────────── BROWSE BY BODY TYPE ──────────────────── */}
      {bodyTypes.length > 0 && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <div className="hide-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {bodyTypes.map((b) => (
                <Link
                  key={b.bodyType}
                  href={`${base}/cars?bodyType=${encodeURIComponent(b.bodyType)}`}
                  className="group flex shrink-0 items-center gap-2.5 rounded-full border border-ink-200 bg-white py-2 pr-4 pl-2.5 transition-colors hover:border-ink-300 hover:bg-ink-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-ink-100 text-ink-500 group-hover:bg-white">
                    <Car className="size-4" />
                  </span>
                  <span className="text-[13.5px] font-medium text-ink-800">{b.bodyType}</span>
                  <span className="text-[12px] text-ink-400 tabular-nums">{b.count}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────── FEATURED CARS ───────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <SectionHead
          template={template}
          eyebrow="Handpicked"
          title="Featured cars this week"
          description="The cars our team would recommend to a friend."
          href={`${base}/cars?featured=1`}
          linkLabel="View all featured"
        />
        {heroCars.length ? (
          <div className="mt-7 grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
            {heroCars.slice(0, 4).map((v, i) => (
              <PublicVehicleCard
                key={v.id}
                vehicle={v}
                href={`${base}/cars/${vehicleSlug(v)}`}
                priority={i < 2}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-7"
            icon={<Car className="size-6" />}
            title="No cars listed yet"
            description="This showroom is preparing its inventory. Check back shortly."
          />
        )}
      </section>

      {/* ─────────────────────────── WHY US ───────────────────────────── */}
      {why.length > 0 && (
        <section className="border-y border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="font-display text-[24px] leading-tight font-semibold text-ink-950 sm:text-[30px]">
              Why buy from {dealer.name}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {why.map((item) => {
                const Icon = ICONS[item.icon] ?? ShieldCheck;
                return (
                  <div
                    key={item.title}
                    className="rounded-[14px] border border-ink-200 bg-white p-5 shadow-xs"
                  >
                    <span className="flex size-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-4 text-[14.5px] font-semibold text-ink-900">{item.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────── RECENTLY ADDED ───────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <SectionHead
          template={template}
          eyebrow="Fresh stock"
          title="Recently added"
          description="New arrivals on our floor, inspected and ready to view."
          href={`${base}/cars`}
          linkLabel="Browse all cars"
        />
        <div className="mt-7 grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
          {recent.items.slice(0, 8).map((v) => (
            <PublicVehicleCard key={v.id} vehicle={v} href={`${base}/cars/${vehicleSlug(v)}`} />
          ))}
        </div>
      </section>

      {/* ──────────────────── BRANDS + BUDGET BROWSING ────────────────── */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-[22px] font-semibold text-ink-950">
              Browse by brand
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {brands.map((b) => (
                <Link
                  key={b.make}
                  href={`${base}/cars?make=${encodeURIComponent(b.make)}`}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-ink-200 bg-white px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="truncate text-[13.5px] font-medium text-ink-800">{b.make}</span>
                  <span className="text-[12px] text-ink-400 tabular-nums">{b.count}</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-[22px] font-semibold text-ink-950">
              Browse by budget
            </h2>
            <div className="mt-6 space-y-2.5">
              {PRICE_BUCKETS.map((p) => (
                <Link
                  key={p.label}
                  href={`${base}/cars?priceMin=${p.min}&priceMax=${p.max}`}
                  className="group flex items-center justify-between rounded-[12px] border border-ink-200 bg-white px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="text-[13.5px] font-medium text-ink-800">{p.label}</span>
                  <ArrowRight className="size-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── BRANCHES ───────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <SectionHead
          template={template}
          eyebrow="Visit us"
          title="Our showrooms"
          description="Walk in for a test drive, or call ahead and we will keep the car ready."
          href={`${base}/branches`}
          linkLabel="All showrooms"
        />
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dealer.branches.map((b) => (
            <div key={b.id} className="rounded-[14px] border border-ink-200 bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-950">{b.name}</h3>
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-500">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                    {[b.addressLine, b.city, b.pincode].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
              {b.openingHours && (
                <p className="mt-3 text-[12.5px] text-ink-500">{b.openingHours}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`${base}/cars?branch=${b.id}`}
                  className="inline-flex h-9 items-center rounded-[9px] border border-ink-200 px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
                >
                  View stock
                </Link>
                {b.phone && (
                  <a
                    href={telHref(b.phone)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-ink-900 px-3 text-[13px] font-medium text-white hover:bg-ink-800"
                  >
                    <Phone className="size-3.5" />
                    Call
                  </a>
                )}
                {b.whatsapp && (
                  <a
                    href={whatsappHref(b.whatsapp, `Hi, I would like to visit the ${b.name}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-success-600 px-3 text-[13px] font-medium text-white hover:bg-success-700"
                  >
                    <MessageCircle className="size-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────── TESTIMONIALS ────────────────────────── */}
      {settings?.showTestimonials !== false && testimonials.length > 0 && (
        <section className="border-y border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="font-display text-[24px] leading-tight font-semibold text-ink-950 sm:text-[30px]">
              What our customers say
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {testimonials.map((t) => (
                <figure
                  key={t.id}
                  className="flex flex-col rounded-[14px] border border-ink-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex gap-0.5" aria-label={`${t.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={
                          i < t.rating
                            ? "size-3.5 fill-warning-600 text-warning-600"
                            : "size-3.5 text-ink-200"
                        }
                      />
                    ))}
                  </div>
                  <blockquote className="mt-3.5 flex-1 text-[13px] leading-relaxed text-ink-600">
                    {t.body}
                  </blockquote>
                  <figcaption className="mt-4 border-t border-ink-100 pt-3.5">
                    <p className="text-[13px] font-semibold text-ink-900">{t.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-400">
                      {[t.city, t.vehicleLabel].filter(Boolean).join(" · ")}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <ShowroomFaq items={faq} template={template} />

      {/* ────────────────────────── CTA BAND ──────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="relative isolate overflow-hidden rounded-[24px] bg-ink-950 px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
          {/* Two soft light sources: cobalt for the brand, a green hint that
              ties to the WhatsApp action. Blurred far enough that they read as
              depth rather than as shapes. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -left-24 size-[420px] rounded-full bg-brand-600/30 blur-[110px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -bottom-36 size-[380px] rounded-full bg-success-600/20 blur-[110px]"
          />
          {/* A faint grid, faded out towards the edges so it never draws
              attention on its own. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-white/70 uppercase ring-1 ring-white/10 ring-inset">
                <Sparkles className="size-3" />
                Personal shortlist
              </p>

              <h2 className="mt-4 font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-white sm:text-[34px]">
                Not sure which car fits?{" "}
                <span className="bg-gradient-to-r from-brand-300 to-white bg-clip-text text-transparent">
                  Tell us what you need.
                </span>
              </h2>

              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
                Share your budget, body type and how you drive. We will shortlist the right cars
                {stats.branches > 1
                  ? ` from all ${stats.branches} showrooms`
                  : " from our current stock"}{" "}
                and send them straight to you.
              </p>

              {/* Buttons sized to their content. WhatsApp leads because that is
                  how most buyers here actually want to talk. */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {dealer.whatsapp && (
                  <a
                    href={whatsappHref(
                      dealer.whatsapp,
                      `Hi ${dealer.name}, I am looking for a car. Can you help me shortlist?`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-success-600 px-6 text-[14.5px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(5,150,105,0.7)] transition-all hover:bg-success-500 hover:shadow-[0_10px_28px_-8px_rgba(5,150,105,0.85)]"
                  >
                    <MessageCircle className="size-[18px]" />
                    Chat on WhatsApp
                  </a>
                )}
                <Link
                  href={`${base}/contact`}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-white/20 bg-white/5 px-6 text-[14.5px] font-medium text-white transition-colors hover:border-white/35 hover:bg-white/10"
                >
                  Request a callback
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <p className="mt-5 text-[12.5px] text-white/35">
                No obligation · we only send cars that match what you asked for
              </p>
            </div>

            {/* What actually happens after they tap. Reduces the hesitation that
                stops people using a contact form at all. */}
            <ol className="relative space-y-px overflow-hidden rounded-[16px] bg-white/[0.04] ring-1 ring-white/10 ring-inset">
              {[
                {
                  step: "01",
                  title: "Tell us the budget",
                  body: "Body type, fuel, how far you drive in a month.",
                },
                {
                  step: "02",
                  title: "We shortlist for you",
                  body:
                    stats.branches > 1
                      ? `Hand-picked across all ${stats.branches} showrooms.`
                      : "Hand-picked from the cars we have in stock.",
                },
                {
                  step: "03",
                  title: "Drive the ones you like",
                  body: "Booked at whichever branch is closest to you.",
                },
              ].map((item) => (
                <li key={item.step} className="flex gap-4 bg-ink-950/40 p-5">
                  <span className="font-display text-[13px] font-semibold text-brand-300 tabular-nums">
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/50">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * A section heading, in the voice of the chosen template.
 *
 * Alignment and the small label above the title are the two things that most
 * change how a page reads, so both follow the template rather than being fixed:
 * Atelier centres everything under a spaced-out caps label, Metro sets a rule
 * beside it, Velocity shouts it in the accent colour.
 */
function SectionHead({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
  template,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  template: TemplateDefinition;
}) {
  const centred = template.heading === "centred";

  const label = eyebrow ? (
    template.eyebrow === "rule" ? (
      <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
        <span className="tpl-accent-bg h-px w-7" />
        {eyebrow}
      </p>
    ) : template.eyebrow === "caps" ? (
      <p className="tpl-accent-text text-[11px] font-semibold tracking-[0.22em] uppercase">
        {eyebrow}
      </p>
    ) : template.eyebrow === "pill" ? (
      <p className="tpl-chip tpl-accent-text inline-flex bg-ink-100 px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase">
        {eyebrow}
      </p>
    ) : null
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-4",
        centred ? "flex-col items-center text-center" : "items-end justify-between",
      )}
    >
      <div className={cn(centred && "flex flex-col items-center")}>
        {label}
        <h2
          className={cn(
            "mt-2 text-[24px] leading-tight text-ink-950",
            centred ? "sm:text-[36px]" : "sm:text-[30px]",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn("mt-2 text-[14px] text-ink-500", centred && "max-w-xl")}>
            {description}
          </p>
        )}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="tpl-accent-text group inline-flex items-center gap-1.5 text-[13.5px] font-medium"
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
