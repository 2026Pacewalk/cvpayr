import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Mail, Clock, Facebook, Instagram, Youtube, Car } from "lucide-react";
import { getDealerBySlug, dealerWorkingHours } from "@/server/dealer";
import { PublicHeader } from "@/components/public/PublicHeader";
import { whatsappHref, telHref } from "@/lib/utils";
import { resolveTemplate, templateVars } from "@/lib/templates";
import { JsonLd } from "@/components/JsonLd";
import { autoDealerSchema, NOINDEX } from "@/lib/seo";

type Params = { params: Promise<{ slug: string }> };

/**
 * The showroom is a live storefront — cars sell, prices move and a dealer can
 * switch template at any moment. Caching the shell would leave a customer
 * looking at stock that is gone and a dealer wondering why their new design
 * never appeared.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "Showroom not found", robots: NOINDEX };

  // The city is what buyers actually type. "Used cars in Ludhiana" is the
  // query; "Sharma Auto" is only searched by people who already know them.
  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";
  const showrooms = dealer.branches.length;

  const title = dealer.websiteSettings?.metaTitle ?? `${dealer.name} — Used Cars${where}`;
  const description =
    dealer.websiteSettings?.metaDescription ??
    dealer.about?.slice(0, 155) ??
    `Browse inspected pre-owned cars at ${dealer.name}${where}. Verified paperwork, finance help and test drives across ${showrooms} showroom${showrooms === 1 ? "" : "s"}.`;

  const image = dealer.coverUrl ?? dealer.logoUrl ?? null;

  return {
    title: { default: title, template: `%s · ${dealer.name}` },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      // A share of this showroom should carry the dealership's name, not the
      // platform's, so this overrides the site-wide default.
      siteName: dealer.name,
      images: image ? [{ url: image, alt: dealer.name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const base = `/d/${dealer.slug}`;
  const settings = dealer.websiteSettings;

  const links = [
    { href: base, label: "Home" },
    { href: `${base}/cars`, label: "Cars" },
    { href: `${base}/branches`, label: "Branches" },
    ...(settings?.showFinance !== false ? [{ href: `${base}/finance`, label: "Finance" }] : []),
    ...(settings?.showSellYourCar !== false ? [{ href: `${base}/sell`, label: "Sell Your Car" }] : []),
    { href: `${base}/about`, label: "About" },
    { href: `${base}/contact`, label: "Contact" },
  ];

  const hours = dealerWorkingHours(dealer);

  // The chosen template decides typography, shape and hero composition for every
  // page under this route. Only its own font pairing is requested, so a dealer
  // never pays to download four typefaces they are not using.
  const template = resolveTemplate(settings?.template);
  const vars = templateVars(template, settings?.themeAccent);

  return (
    <div
      className={`tpl tpl-${template.key} flex min-h-dvh flex-col bg-white`}
      style={vars as React.CSSProperties}
      data-template={template.key}
    >
      {/* The dealership as a local business. Declared once here so every page
          of the showroom carries it, which is what a local pack result needs. */}
      <JsonLd
        nodes={[
          autoDealerSchema(dealer, {
            hours,
            branches: dealer.branches.map((b) => ({
              name: b.name,
              phone: b.phone,
              addressLine: b.addressLine,
              city: b.city,
              state: b.state,
              pincode: b.pincode,
            })),
          }),
        ]}
      />

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={template.fonts.href} />

      <PublicHeader dealer={dealer} links={links} base={base} />

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-ink-200 bg-ink-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-[9px] bg-white/10">
                  <Car className="size-[18px]" />
                </span>
                <span className="font-display text-[15px] font-semibold">{dealer.name}</span>
              </div>
              {dealer.tagline && (
                <p className="mt-3 text-[13px] leading-relaxed text-white/50">{dealer.tagline}</p>
              )}
              <div className="mt-5 flex gap-2">
                {dealer.facebookUrl && (
                  <a href={dealer.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="flex size-9 items-center justify-center rounded-[9px] bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                    <Facebook className="size-4" />
                  </a>
                )}
                {dealer.instagramUrl && (
                  <a href={dealer.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="flex size-9 items-center justify-center rounded-[9px] bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                    <Instagram className="size-4" />
                  </a>
                )}
                {dealer.youtubeUrl && (
                  <a href={dealer.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="YouTube"
                    className="flex size-9 items-center justify-center rounded-[9px] bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                    <Youtube className="size-4" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                Browse
              </h3>
              <ul className="mt-4 space-y-2.5 text-[13.5px]">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-white/70 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                Showrooms
              </h3>
              <ul className="mt-4 space-y-3 text-[13px]">
                {dealer.branches.map((b) => (
                  <li key={b.id}>
                    <p className="font-medium text-white/85">{b.name}</p>
                    <p className="mt-0.5 text-white/50">
                      {[b.addressLine, b.city].filter(Boolean).join(", ")}
                    </p>
                    {b.phone && (
                      <a href={telHref(b.phone)} className="mt-0.5 inline-block text-white/60 hover:text-white">
                        {b.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                Get in touch
              </h3>
              <ul className="mt-4 space-y-3 text-[13px] text-white/70">
                {dealer.phone && (
                  <li className="flex gap-2.5">
                    <Phone className="mt-0.5 size-4 shrink-0 text-white/40" />
                    <a href={telHref(dealer.phone)} className="hover:text-white">{dealer.phone}</a>
                  </li>
                )}
                {dealer.email && (
                  <li className="flex gap-2.5">
                    <Mail className="mt-0.5 size-4 shrink-0 text-white/40" />
                    <a href={`mailto:${dealer.email}`} className="break-all hover:text-white">{dealer.email}</a>
                  </li>
                )}
                {(dealer.addressLine || dealer.city) && (
                  <li className="flex gap-2.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-white/40" />
                    <span>
                      {[dealer.addressLine, dealer.city, dealer.state, dealer.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </li>
                )}
                {hours.length > 0 && (
                  <li className="flex gap-2.5">
                    <Clock className="mt-0.5 size-4 shrink-0 text-white/40" />
                    <span>
                      Mon–Sat {hours[0]?.open}–{hours[0]?.close}
                      <br />
                      Sun {hours[6]?.open ?? "Closed"}
                      {hours[6]?.close ? `–${hours[6].close}` : ""}
                    </span>
                  </li>
                )}
              </ul>
              {dealer.whatsapp && (
                <a
                  href={whatsappHref(dealer.whatsapp, `Hi ${dealer.name}, I have a question about a car.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-[10px] bg-success-600 px-4 text-[13px] font-medium text-white hover:bg-success-700"
                >
                  Message on WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-[12.5px] text-white/40 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {dealer.legalName ?? dealer.name}.
              {dealer.gstin && <span className="ml-2">GSTIN {dealer.gstin}</span>}
            </p>
            <p>
              Powered by{" "}
              <Link href="/" className="text-white/60 hover:text-white">
                CarVyapar.in
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
