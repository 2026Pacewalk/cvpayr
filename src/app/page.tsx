import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/ui/Button";
import { PricingTable, type PricingPlan } from "@/components/marketing/PricingTable";
import { MarketingNav, MarketingFAQ } from "@/components/marketing/MarketingChrome";
import { FAQS } from "@/lib/marketing-faq";
import { JsonLd } from "@/components/JsonLd";
import { faqSchema, siteUrl, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import { formatPrice, safeJsonParse } from "@/lib/utils";
import { YEARLY_DISCOUNT_PERCENT } from "@/lib/billing";
import {
  Gauge, Car, Building2, Users, LineChart, MessageSquare, ArrowRight, ShieldCheck,
  Smartphone, Share2, Globe, KanbanSquare, Timer, IndianRupee, Check, Zap, Lock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CarVyapar.in — Digital showroom & CRM for used car dealers",
  description:
    "Give every branch a shared inventory, every customer a beautiful showroom, and your team a pipeline where no enquiry goes missing.",
  alternates: { canonical: "/" },
};

const SURFACES = [
  {
    tag: "For your customers",
    icon: Globe,
    title: "A showroom that sells while you sleep",
    body: "Your own branded website with every car from every branch. Advanced filters, EMI estimates, WhatsApp on every listing, and SEO-friendly pages built to rank.",
    points: ["Branded to your dealership", "Search, filter, compare, shortlist", "One-tap WhatsApp and call"],
    href: "/d/sharma-auto",
    cta: "See a live showroom",
  },
  {
    tag: "For your team",
    icon: KanbanSquare,
    title: "A CRM that fits how cars actually sell",
    body: "Every enquiry lands as a lead with the vehicle, branch and source attached. Drag it through the pipeline, log the call, book the test drive, close the deal.",
    points: ["Kanban pipeline and table view", "Follow-ups that chase you back", "Booking to sale in two taps"],
    href: "/login",
    cta: "Open the dealer console",
  },
  {
    tag: "For you",
    icon: LineChart,
    title: "The numbers that decide what to buy next",
    body: "Ageing stock, branch performance, executive conversion and true margin — with cost and profit hidden from everyone you have not explicitly trusted.",
    points: ["Inventory ageing by branch", "Margin gated by permission", "Export anything to CSV"],
    href: "/login",
    cta: "See the reports",
  },
];

const FEATURES = [
  { icon: Car, title: "Inventory in one place", body: "Add a car once with photos, condition, paperwork and private cost. It publishes everywhere instantly." },
  { icon: Building2, title: "Real multi-branch control", body: "Assign stock to branches, transfer between them, and see inventory, leads, staff and sales branch by branch." },
  { icon: MessageSquare, title: "Every enquiry becomes a lead", body: "Website forms, WhatsApp taps and walk-ins all land in one pipeline with full attribution." },
  { icon: Lock, title: "Permissions that protect margin", body: "Your executives see the asking price. Only you see what the car cost and what it earned." },
  { icon: Timer, title: "Ageing you cannot ignore", body: "Know exactly which cars have sat 60 or 90 days, what they are worth, and which branch is holding them." },
  { icon: Share2, title: "Share a shortlist in seconds", body: "While a customer is on the phone, filter stock, pick three cars and send a personalised link." },
  { icon: Users, title: "Roles for every seat", body: "Owner, branch manager, inventory head, sales executive, lead manager, view-only — or build your own." },
  { icon: Zap, title: "Quick Match on a call", body: "Type what the customer wants, see matching stock instantly, send the link before they hang up." },
];

const FLOW = [
  { step: "01", title: "Add the car", body: "Photos, condition, paperwork, private cost." },
  { step: "02", title: "It goes live", body: "Published to your showroom and every branch view." },
  { step: "03", title: "Enquiry arrives", body: "Becomes a lead with vehicle, branch and source attached." },
  { step: "04", title: "Team works it", body: "Assign, call, follow up, book the test drive." },
  { step: "05", title: "Deal closes", body: "Booking, then sale. Car archives, margin lands in reports." },
];

export default async function PlatformHome() {
  const [dealers, plans, stats] = await Promise.all([
    db.dealer.findMany({
      where: { status: { in: ["active", "trial"] } },
      select: {
        id: true, slug: true, name: true, tagline: true, city: true, state: true, coverUrl: true,
        _count: { select: { vehicles: true, branches: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 4,
    }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    Promise.all([
      db.vehicle.count(),
      db.lead.count(),
      db.dealer.count(),
      db.sale.aggregate({ _sum: { salePrice: true } }),
    ]),
  ]);

  const [vehicleCount, leadCount, dealerCount, gmv] = stats;

  const pricingPlans: PricingPlan[] = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    maxBranches: p.maxBranches,
    maxUsers: p.maxUsers,
    maxVehicles: p.maxVehicles,
    maxImagesPerVehicle: p.maxImagesPerVehicle,
    features: safeJsonParse<Record<string, boolean>>(p.features, {}),
  }));

  return (
    <div className="bg-white">
      <JsonLd
        nodes={[
          faqSchema(FAQS.map((f) => ({ question: f.q, answer: f.a }))),
          {
            "@type": "SoftwareApplication",
            name: SITE_NAME,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: siteUrl(),
            description: SITE_TAGLINE,
            provider: { "@id": `${siteUrl()}/#organization` },
            // Priced from the plans this page actually renders below, so the
            // markup cannot advertise a number the pricing table does not show.
            offers: pricingPlans.map((plan) => ({
              "@type": "Offer",
              name: plan.name,
              description: plan.description ?? undefined,
              price: plan.priceMonthly,
              priceCurrency: "INR",
              category: "monthly subscription",
            })),
          },
        ]}
      />

      <MarketingNav />

      {/* ───────────────────────────── HERO ─────────────────────────────
          Pulled up under the sticky header so the transparent nav overlays the
          dark hero at the top of the page. */}
      <section className="relative -mt-16 overflow-hidden bg-ink-950 pt-16">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.28]"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1567818735868-e71b99932e29?auto=format&fit=crop&w=1920&q=80)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/90 to-ink-950" />
        <div className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />

        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12.5px] font-medium text-white/75 backdrop-blur-sm">
            <ShieldCheck className="size-3.5" />
            Built for Indian used-car dealerships
          </p>

          <h1 className="mt-7 max-w-4xl font-display text-[36px] leading-[1.06] font-semibold tracking-[-0.03em] text-white sm:text-[60px]">
            Your showroom, your stock,
            <span className="bg-gradient-to-r from-brand-300 to-white bg-clip-text text-transparent">
              {" "}your customers.
            </span>{" "}
            One system.
          </h1>

          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/60 sm:text-[18px]">
            Give every branch a shared inventory, every customer a showroom worth browsing, and
            your team a pipeline where no enquiry goes missing.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <LinkButton href="/login" size="lg" className="h-12 px-6 text-[15px]">
              Start your free trial
              <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton
              href="/d/sharma-auto"
              size="lg"
              variant="outline"
              className="h-12 border-white/20 bg-white/5 px-6 text-[15px] text-white hover:border-white/35 hover:bg-white/10"
            >
              See a live showroom
            </LinkButton>
          </div>

          <p className="mt-4 text-[13px] text-white/40">
            14-day trial · no card required · {YEARLY_DISCOUNT_PERCENT}% off when you pay yearly
          </p>

          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-10 sm:grid-cols-4">
            {[
              { k: "Dealerships", v: `${dealerCount}` },
              { k: "Vehicles listed", v: `${vehicleCount}` },
              { k: "Leads captured", v: `${leadCount}` },
              { k: "GMV processed", v: formatPrice(gmv._sum.salePrice ?? 0) },
            ].map((s) => (
              <div key={s.k}>
                <dd className="font-display text-[26px] leading-none font-semibold text-white tabular-nums">
                  {s.v}
                </dd>
                <dt className="mt-2 text-[11.5px] font-medium tracking-[0.06em] text-white/40 uppercase">
                  {s.k}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ──────────────────────── THREE SURFACES ──────────────────────── */}
      <section id="product" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.1em] text-brand-600 uppercase">
            One account, three surfaces
          </p>
          <h2 className="mt-3 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink-950 sm:text-[42px]">
            Not a marketplace. Your dealership, online.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-500">
            Customers browse your cars on your site. Your team works them in your CRM. You see the
            numbers nobody else does.
          </p>
        </div>

        <div className="mt-14 space-y-6">
          {SURFACES.map((s, i) => (
            <div
              key={s.title}
              className={`grid items-center gap-8 rounded-[20px] border border-ink-200 bg-ink-50/60 p-7 sm:p-10 lg:grid-cols-2 ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold tracking-wide text-brand-700 uppercase ring-1 ring-brand-100 ring-inset">
                  {s.tag}
                </span>
                <h3 className="mt-5 font-display text-[24px] leading-tight font-semibold text-ink-950 sm:text-[30px]">
                  {s.title}
                </h3>
                <p className="mt-3.5 text-[15px] leading-relaxed text-ink-600">{s.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-[14px] text-ink-700">
                      <span className="flex size-5 items-center justify-center rounded-full bg-success-50 text-success-600">
                        <Check className="size-3" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href={s.href}
                  className="group mt-7 inline-flex items-center gap-2 text-[14px] font-semibold text-brand-700 hover:text-brand-800"
                >
                  {s.cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <div className="flex items-center justify-center">
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[16px] border border-ink-200 bg-white shadow-sm">
                  <s.icon className="size-20 text-ink-200" strokeWidth={1.1} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── THE WORKFLOW ───────────────────────── */}
      <section className="border-y border-ink-200 bg-ink-950 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold tracking-[0.1em] text-brand-400 uppercase">
              The heart of it
            </p>
            <h2 className="mt-3 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-white sm:text-[42px]">
              From forecourt to sold, without a spreadsheet
            </h2>
          </div>

          <ol className="mt-14 grid gap-px overflow-hidden rounded-[18px] bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((f) => (
              <li key={f.step} className="bg-ink-950 p-6">
                <span className="font-display text-[13px] font-semibold text-brand-400">{f.step}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-white">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">{f.body}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 max-w-2xl text-[14px] leading-relaxed text-white/50">
            Closing a sale archives the car, records the margin, and automatically closes every
            other open enquiry on it with the reason <em>Vehicle sold</em> — so nobody chases a car
            that is already gone.
          </p>
        </div>
      </section>

      {/* ─────────────────────────── FEATURES ─────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.1em] text-brand-600 uppercase">
            Everything included
          </p>
          <h2 className="mt-3 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink-950 sm:text-[42px]">
            The operational detail a used-car business runs on
          </h2>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-[18px] border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white p-6 transition-colors hover:bg-ink-50/60">
              <span className="flex size-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────────── MOBILE ──────────────────────────── */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex size-11 items-center justify-center rounded-[12px] bg-ink-900 text-white">
              <Smartphone className="size-5" />
            </span>
            <h2 className="mt-6 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink-950 sm:text-[38px]">
              Your sales floor runs on a phone. So does this.
            </h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
              Add a car from the forecourt. Update a follow-up between customers. Call or WhatsApp a
              lead in one tap. Filters open as bottom sheets, tables become cards, and the actions
              you need stay pinned to the bottom of the screen.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              "One-tap call & WhatsApp",
              "Bottom-sheet filters",
              "Sticky action bars",
              "Cards instead of cramped tables",
              "Drag-to-reorder photo upload",
              "Follow-ups updated in seconds",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2.5 rounded-[12px] border border-ink-200 bg-white px-4 py-3.5 text-[13.5px] text-ink-700"
              >
                <Check className="size-4 shrink-0 text-success-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ──────────────────────────── PRICING ─────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold tracking-[0.1em] text-brand-600 uppercase">
            Pricing
          </p>
          <h2 className="mt-3 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink-950 sm:text-[42px]">
            One price. Every feature that fits your size.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-500">
            No per-lead charges, no commission on a sale. Pay yearly and{" "}
            {YEARLY_DISCOUNT_PERCENT}% comes off automatically.
          </p>
        </div>

        <div className="mt-12">
          <PricingTable plans={pricingPlans} />
        </div>
      </section>

      {/* ───────────────────────── LIVE SHOWROOMS ─────────────────────── */}
      {dealers.length > 0 && (
        <section className="border-y border-ink-200 bg-ink-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-[26px] leading-tight font-semibold text-ink-950 sm:text-[34px]">
                  Showrooms running on CarVyapar
                </h2>
                <p className="mt-2 text-[14.5px] text-ink-500">
                  Each dealership gets its own public site at{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px] text-brand-700">
                    /d/&lt;name&gt;
                  </code>
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {dealers.map((d) => (
                <Link
                  key={d.id}
                  href={`/d/${d.slug}`}
                  className="group relative overflow-hidden rounded-[18px] border border-ink-200 bg-ink-900 shadow-sm transition-shadow hover:shadow-xl"
                >
                  {d.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.coverUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover opacity-45 transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
                  <div className="relative flex h-full min-h-[210px] flex-col justify-end p-6">
                    <h3 className="font-display text-[20px] font-semibold text-white">{d.name}</h3>
                    {d.tagline && <p className="mt-1 text-[13px] text-white/60">{d.tagline}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/70">
                      <span>{d._count.vehicles} vehicles</span>
                      <span className="size-1 rounded-full bg-white/30" />
                      <span>
                        {d._count.branches} branch{d._count.branches === 1 ? "" : "es"}
                      </span>
                      {(d.city || d.state) && (
                        <>
                          <span className="size-1 rounded-full bg-white/30" />
                          <span>{[d.city, d.state].filter(Boolean).join(", ")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────────────── FAQ ───────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <h2 className="text-center font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink-950 sm:text-[36px]">
          Questions dealers ask us
        </h2>
        <div className="mt-10">
          <MarketingFAQ />
        </div>
      </section>

      {/* ──────────────────────────── CTA ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:pb-28">
        <div className="relative overflow-hidden rounded-[24px] bg-ink-950 px-7 py-14 text-center sm:px-12 sm:py-20">
          <div className="absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[100px]" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-[28px] leading-[1.12] font-semibold tracking-[-0.02em] text-white sm:text-[40px]">
              Put your whole dealership online this week
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15.5px] leading-relaxed text-white/60">
              Set up your branches, upload your stock, and start capturing every enquiry that comes
              in. Most dealers are live the same day.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <LinkButton href="/login" size="lg" className="h-12 px-7 text-[15px]">
                Start your free trial
                <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton
                href="/d/sharma-auto"
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-white/5 px-7 text-[15px] text-white hover:border-white/35 hover:bg-white/10"
              >
                Explore the demo
              </LinkButton>
            </div>
            <p className="mt-5 text-[12.5px] text-white/35">
              14-day trial · no card required · cancel any time
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── FOOTER ───────────────────────────── */}
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink-900 text-white">
                  <Gauge className="size-[18px]" />
                </span>
                <span className="font-display text-[16px] font-semibold tracking-tight text-ink-950">
                  CarVyapar.in
                </span>
              </div>
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-500">
                The operating system for used-car dealerships — showroom, inventory and CRM in one
                account.
              </p>
            </div>

            {[
              {
                title: "Product",
                links: [
                  { label: "Features", href: "#features" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Demo showroom", href: "/d/sharma-auto" },
                  { label: "Dealer sign in", href: "/login" },
                ],
              },
              {
                title: "For dealers",
                links: [
                  { label: "Multi-branch inventory", href: "#product" },
                  { label: "Lead pipeline", href: "#product" },
                  { label: "Reports & ageing", href: "#product" },
                  { label: "Mobile experience", href: "#features" },
                ],
              },
              {
                title: "Platform",
                links: [
                  { label: "Platform console", href: "/admin" },
                  { label: "Plans & limits", href: "#pricing" },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5 text-[13.5px]">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-ink-600 transition-colors hover:text-ink-950">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-ink-100 pt-7 text-[12.5px] text-ink-400 sm:flex-row">
            <p>© {new Date().getFullYear()} CarVyapar.in — dealership operating system.</p>
            <p className="flex items-center gap-1.5">
              <IndianRupee className="size-3.5" />
              Priced in INR · GST extra
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
