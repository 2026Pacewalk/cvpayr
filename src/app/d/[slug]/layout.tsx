import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getDealerBySlug, dealerWorkingHours, getPopularBrands, getBodyTypeCounts,
} from "@/server/dealer";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ShowroomFooter } from "@/components/public/ShowroomFooter";
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

  // Stock counts for the footer's browse chips. Both helpers are wrapped in
  // React cache(), so a page that already asked for them is not charged twice.
  const [brands, bodyTypes] = await Promise.all([
    getPopularBrands(dealer.id),
    getBodyTypeCounts(dealer.id),
  ]);

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

      <ShowroomFooter
        dealer={dealer}
        base={base}
        links={links}
        branches={dealer.branches}
        hours={hours}
        brands={brands}
        bodyTypes={bodyTypes}
      />
    </div>
  );
}
