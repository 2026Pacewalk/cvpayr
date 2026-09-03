import Link from "next/link";
import {
  MapPin, Phone, Mail, Clock, Navigation, MessageCircle, Car,
  Facebook, Instagram, Youtube, Linkedin, ArrowUpRight,
} from "lucide-react";
import type { WorkingHour } from "@/server/dealer";
import { whatsappHref, telHref, cn } from "@/lib/utils";
import { PRICE_BUCKETS } from "@/lib/constants";

/**
 * The showroom footer.
 *
 * It carries three jobs at once, in this order of importance to the dealership:
 *
 *  1. Contact. A buyer who scrolled this far and did not enquire is one tap from
 *     the phone, WhatsApp and directions to the nearest showroom.
 *  2. Discovery. The stock chips are the only internal links anywhere in the app
 *     pointing at the filtered listing pages — /cars?make=, ?bodyType=, ?city=.
 *     Those pages are indexable by design (see shouldIndexFacets in lib/seo.ts),
 *     and without these links a crawler could only reach them through the
 *     sitemap, which is a much weaker signal. They also happen to be how a real
 *     buyer shops: by brand, by shape, by budget.
 *  3. Standing. Address, GSTIN and hours are what separate a dealership from a
 *     man with a phone number.
 *
 * Every link here resolves to a route that exists and a filter the server
 * actually parses. Nothing is decorative.
 */

export type FooterBranch = {
  id: string;
  name: string;
  city: string;
  addressLine: string | null;
  phone: string | null;
  mapsUrl: string | null;
};

export type FooterDealer = {
  name: string;
  legalName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  linkedinUrl: string | null;
};

const SOCIALS = [
  { key: "facebookUrl", label: "Facebook", Icon: Facebook },
  { key: "instagramUrl", label: "Instagram", Icon: Instagram },
  { key: "youtubeUrl", label: "YouTube", Icon: Youtube },
  { key: "linkedinUrl", label: "LinkedIn", Icon: Linkedin },
] as const;

/**
 * Whether a stored string is a real place name rather than a placeholder.
 *
 * Dealers are onboarded before they have filled everything in, and one seeded
 * dealership stores "—" as its branch city. Printed, that is a stray dash; used
 * as a filter link it is /cars?city=— , which matches nothing.
 */
const meaningful = (v: string | null | undefined): v is string =>
  Boolean(v) && v!.trim().length > 1 && /\p{L}/u.test(v!);

/**
 * Whether a value is worth printing at all.
 *
 * Looser than meaningful(): an address line legitimately contains parts with no
 * letters in them — a pincode is six digits — so this only rejects the empty
 * and the purely decorative.
 */
const present = (v: string | null | undefined): v is string =>
  Boolean(v) && v!.trim().length > 0 && !/^[\p{P}\p{S}\s]+$/u.test(v!);

/** Small caps heading used above every group. */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10.5px] font-semibold tracking-[0.16em] text-white/35 uppercase">
      {children}
    </h3>
  );
}

/**
 * A filter link with its live count.
 *
 * The count is the honest part: a brand with two cars says two, so a buyer is
 * never sent to a page with less than they expected.
 */
function Chip({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="tpl-chip inline-flex h-9 items-center gap-1.5 border border-white/10 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white/75 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
    >
      {label}
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-white/35">{count}</span>
      )}
    </Link>
  );
}

/**
 * Collapses the week into the ranges people actually read.
 *
 * The old footer indexed hours[0] and hours[6] directly and printed "Mon–Sat"
 * whatever was stored, which was wrong for any dealer who does not work a
 * uniform week — and crashed nothing but quietly lied.
 */
function hourLines(hours: WorkingHour[]): { days: string; time: string }[] {
  const short = (d: string) => d.slice(0, 3);
  const out: { days: string; time: string }[] = [];

  for (const h of hours) {
    const time = h.closed || !h.open || !h.close ? "Closed" : `${h.open} – ${h.close}`;
    const last = out[out.length - 1];
    // Run days together while the hours match, so a normal week reads as one line.
    if (last && last.time === time) {
      const [from] = last.days.split("–");
      last.days = `${from}–${short(h.day)}`;
    } else {
      out.push({ days: short(h.day), time });
    }
  }
  return out;
}

export function ShowroomFooter({
  dealer,
  base,
  links,
  branches,
  hours,
  brands,
  bodyTypes,
}: {
  dealer: FooterDealer;
  base: string;
  links: { href: string; label: string }[];
  branches: FooterBranch[];
  hours: WorkingHour[];
  brands: { make: string; count: number }[];
  bodyTypes: { bodyType: string; count: number }[];
}) {
  const stock = bodyTypes.reduce((n, b) => n + b.count, 0);
  const cities = [...new Set(branches.map((b) => b.city))].filter(meaningful);
  const schedule = hourLines(hours);
  const socials = SOCIALS.filter((s) => dealer[s.key]);

  const address = [dealer.addressLine, dealer.city, dealer.state, dealer.pincode]
    .filter(present)
    .join(", ");

  // A heading with nothing under it looks like the page failed to load, so the
  // whole column only appears once there is something in it.
  const hasContact = Boolean(
    dealer.phone || dealer.email || address || schedule.length || dealer.whatsapp,
  );

  return (
    <footer className="showroom-footer mt-16 bg-ink-950 text-white">
      {/* The dealership's own colour, as a hairline. See .showroom-footer in
          globals.css for why it is mixed rather than used raw. */}
      <div className="h-[3px] w-full" style={{ background: "var(--footer-accent)" }} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* ─────────────────── FIND A CAR ─────────────────── */}
        {stock > 0 && (
          <section className="grid gap-8 border-b border-white/10 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {brands.length > 0 && (
              <div>
                <GroupTitle>By brand</GroupTitle>
                <div className="mt-4 flex flex-wrap gap-2">
                  {brands.slice(0, 8).map((b) => (
                    <Chip
                      key={b.make}
                      href={`${base}/cars?make=${encodeURIComponent(b.make)}`}
                      label={b.make}
                      count={b.count}
                    />
                  ))}
                </div>
              </div>
            )}

            {bodyTypes.length > 0 && (
              <div>
                <GroupTitle>By body type</GroupTitle>
                <div className="mt-4 flex flex-wrap gap-2">
                  {bodyTypes.slice(0, 8).map((b) => (
                    <Chip
                      key={b.bodyType}
                      href={`${base}/cars?bodyType=${encodeURIComponent(b.bodyType)}`}
                      label={b.bodyType}
                      count={b.count}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <GroupTitle>By budget</GroupTitle>
              <div className="mt-4 flex flex-wrap gap-2">
                {PRICE_BUCKETS.map((p) => (
                  <Chip
                    key={p.label}
                    href={`${base}/cars?priceMin=${p.min}&priceMax=${p.max}`}
                    label={p.label}
                  />
                ))}
              </div>
            </div>

            {cities.length > 0 && (
              <div>
                <GroupTitle>By city</GroupTitle>
                <div className="mt-4 flex flex-wrap gap-2">
                  {cities.map((c) => (
                    <Chip
                      key={c}
                      href={`${base}/cars?city=${encodeURIComponent(c)}`}
                      label={c}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─────────────────── THE DEALERSHIP ─────────────────── */}
        <div className="grid gap-10 py-12 lg:grid-cols-12">
          {/* Identity */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2.5">
              {dealer.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dealer.logoUrl}
                  alt={dealer.name}
                  className="tpl-image size-10 object-cover ring-1 ring-white/15"
                />
              ) : (
                <span className="tpl-image flex size-10 items-center justify-center bg-white/10">
                  <Car className="size-5" />
                </span>
              )}
              <span className="tpl-display text-[16px] leading-tight font-semibold">
                {dealer.name}
              </span>
            </div>

            {dealer.tagline && (
              <p className="mt-4 text-[13px] leading-relaxed text-white/50">{dealer.tagline}</p>
            )}

            {stock > 0 && (
              <p className="mt-4 text-[12.5px] text-white/40">
                <span className="font-semibold text-white/70 tabular-nums">{stock}</span> cars in
                stock across{" "}
                <span className="font-semibold text-white/70 tabular-nums">{branches.length}</span>{" "}
                showroom{branches.length === 1 ? "" : "s"}
              </p>
            )}

            {socials.length > 0 && (
              <div className="mt-5 flex gap-2">
                {socials.map(({ key, label, Icon }) => (
                  <a
                    key={key}
                    href={dealer[key] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="tpl-button flex size-10 items-center justify-center bg-white/5 text-white/60 transition-colors hover:bg-white/12 hover:text-white"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Pages */}
          <nav className="lg:col-span-2">
            <GroupTitle>Browse</GroupTitle>
            {/* Two columns on a phone: nine stacked links is a lot of scrolling
                in a footer that already carries the stock chips. */}
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13.5px] lg:grid-cols-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-white/65 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`${base}/shortlist`}
                  className="text-white/65 transition-colors hover:text-white"
                >
                  Your shortlist
                </Link>
              </li>
              <li>
                <Link
                  href={`${base}/compare`}
                  className="text-white/65 transition-colors hover:text-white"
                >
                  Compare cars
                </Link>
              </li>
            </ul>
          </nav>

          {/* Showrooms — each one a real address with a way to get there */}
          <div className="lg:col-span-4">
            <GroupTitle>Showrooms</GroupTitle>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {branches.map((b) => (
                <li
                  key={b.id}
                  className="tpl-card border border-white/10 bg-white/[0.03] p-3.5"
                >
                  <p className="text-[13.5px] font-semibold text-white/90">{b.name}</p>
                  {[b.addressLine, b.city].some(present) && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-white/45">
                      {[b.addressLine, b.city].filter(present).join(", ")}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {b.phone && (
                      <a
                        href={telHref(b.phone)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/70 hover:text-white"
                      >
                        <Phone className="size-3.5" />
                        {b.phone}
                      </a>
                    )}
                    {b.mapsUrl && (
                      <a
                        href={b.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
                        style={{ color: "var(--footer-accent)" }}
                      >
                        <Navigation className="size-3.5" />
                        Directions
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className={cn("lg:col-span-3", !hasContact && "hidden")}>
            <GroupTitle>Get in touch</GroupTitle>
            <ul className="mt-4 space-y-3 text-[13px] text-white/65">
              {dealer.phone && (
                <li className="flex gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-white/30" />
                  <a href={telHref(dealer.phone)} className="hover:text-white">
                    {dealer.phone}
                  </a>
                </li>
              )}
              {dealer.email && (
                <li className="flex gap-2.5">
                  <Mail className="mt-0.5 size-4 shrink-0 text-white/30" />
                  <a href={`mailto:${dealer.email}`} className="break-all hover:text-white">
                    {dealer.email}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-white/30" />
                  <span className="leading-relaxed">{address}</span>
                </li>
              )}
              {schedule.length > 0 && (
                <li className="flex gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-white/30" />
                  <span className="leading-relaxed">
                    {schedule.map((s) => (
                      <span key={s.days} className="block">
                        <span className="inline-block w-[76px] text-white/45">{s.days}</span>
                        <span className={cn(s.time === "Closed" && "text-white/35")}>{s.time}</span>
                      </span>
                    ))}
                  </span>
                </li>
              )}
            </ul>

            {dealer.whatsapp && (
              <a
                href={whatsappHref(
                  dealer.whatsapp,
                  `Hi ${dealer.name}, I have a question about a car.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="tpl-button mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-success-600 px-4 text-[14px] font-semibold text-white transition-colors hover:bg-success-700 sm:w-auto"
              >
                <MessageCircle className="size-4" />
                Message on WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* ─────────────────── LEGAL ─────────────────── */}
        <div className="flex flex-col items-start justify-between gap-3 border-t border-white/10 py-6 text-[12.5px] text-white/35 sm:flex-row sm:items-center">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              © {new Date().getFullYear()} {dealer.legalName ?? dealer.name}
            </span>
            {dealer.gstin && (
              <span className="text-white/25">GSTIN {dealer.gstin}</span>
            )}
          </p>
          <p>
            Powered by{" "}
            <Link
              href="/"
              className="inline-flex items-center gap-0.5 text-white/55 transition-colors hover:text-white"
            >
              CarVyapar.in
              <ArrowUpRight className="size-3" />
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
