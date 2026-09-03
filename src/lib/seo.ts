/**
 * Shared SEO primitives: absolute URLs, structured data, and the indexing
 * policy for faceted pages.
 *
 * Everything a crawler is told about this site is built here so the rules stay
 * in one place. Two of them are worth stating plainly:
 *
 *  - Canonicals are always absolute. A relative canonical on a multi-tenant
 *    site is how one dealer's showroom ends up consolidated into another's.
 *  - Facet combinations are noindex. Inventory filters multiply into millions
 *    of near-identical URLs; letting a crawler walk them wastes the crawl
 *    budget that should be spent on the car pages that actually convert.
 */

export const SITE_NAME = "CarVyapar";
export const SITE_DOMAIN = "carvyapar.in";
export const SITE_TAGLINE = "Digital showroom & CRM for used car dealers";

/**
 * The public origin, without a trailing slash.
 *
 * Falling back to localhost in production would emit localhost canonicals and
 * quietly deindex the entire site, so production falls back to the real domain
 * instead. APP_URL should still be set — deploy/update.sh warns when it is not.
 */
export function siteUrl(): string {
  const raw =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production" ? `https://${SITE_DOMAIN}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

/**
 * Makes a path absolute, leaving anything that already is alone.
 *
 * Uploads may be local paths today and object-storage URLs tomorrow, and the
 * two are mixed in the same field. Prefixing an https:// image with the site
 * origin produces a URL that resolves to nothing, which silently strips the
 * photos out of a listing's structured data.
 */
export function absoluteUrl(path = "/"): string {
  if (/^(https?:)?\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Pages that exist for a visitor but have nothing to offer a search engine. */
export const NOINDEX = { index: false, follow: true } as const;

/* ----------------------------- FACET POLICY ---------------------------- */

/**
 * Filters that produce a page worth ranking on their own — "Maruti cars in
 * Ludhiana" is a real search, "petrol automatic white under 4 lakh sorted by
 * mileage" is not.
 */
const INDEXABLE_FACETS = ["make", "model", "bodyType", "fuel", "city"] as const;

/**
 * Decides whether a filtered inventory URL should be indexed.
 *
 * One or two meaningful facets earn a place in the index. Free-text search,
 * sorting, and deeper combinations do not: they are the same stock rearranged,
 * and each one a crawler follows is one it does not spend on a car listing.
 */
export function shouldIndexFacets(sp: Record<string, string | string[] | undefined>): boolean {
  const present = Object.entries(sp).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "",
  );

  let facets = 0;
  for (const [key, value] of present) {
    if (key === "page") continue;
    if (!(INDEXABLE_FACETS as readonly string[]).includes(key)) return false;
    // A multi-select that actually selected several values is a combination.
    if (Array.isArray(value) && value.length > 1) return false;
    facets += 1;
  }
  return facets <= 2;
}

/** Rebuilds a canonical query string from only the facets worth keeping. */
export function canonicalFacetQuery(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const key of [...INDEXABLE_FACETS, "page"]) {
    const value = sp[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first && !(key === "page" && first === "1")) params.set(key, first);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/* ---------------------------- STRUCTURED DATA -------------------------- */

type Json = Record<string, unknown>;

/** Drops undefined/null/empty entries so no empty property reaches the graph. */
export function compact<T extends Json>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  ) as T;
}

export function organizationSchema(): Json {
  return {
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE_NAME,
    alternateName: "CarVyapar.in",
    url: siteUrl(),
    description: SITE_TAGLINE,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icons/icon-512.png"),
      width: 512,
      height: 512,
    },
    image: absoluteUrl("/og.png"),
    areaServed: { "@type": "Country", name: "India" },
  };
}

export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    url: siteUrl(),
    name: SITE_NAME,
    description: SITE_TAGLINE,
    inLanguage: "en-IN",
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function faqSchema(items: { question: string; answer: string }[]): Json {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * Wraps one or more nodes in a single @graph so a page emits one script tag.
 *
 * The `<` escaping is load-bearing, not cosmetic. This string is injected with
 * dangerouslySetInnerHTML, and almost everything in the graph is dealer-entered
 * text: dealership name, tagline, about, branch names, vehicle descriptions. An
 * HTML parser ends a <script> block at the first literal `</script`, wherever it
 * appears — so a dealer who typed that into their own About field would break
 * out of the JSON-LD and run script on this origin, which is the same origin as
 * the CRM. `<` is a valid JSON escape, so parsers see identical data.
 */
export function graph(...nodes: (Json | null | undefined)[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  }).replace(/</g, "\\u003c");
}

/* ------------------------------ AUTO DEALER ---------------------------- */

type Address = {
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

function postalAddress(a: Address): Json | undefined {
  if (!a.addressLine && !a.city) return undefined;
  return compact({
    "@type": "PostalAddress",
    streetAddress: a.addressLine ?? undefined,
    addressLocality: a.city ?? undefined,
    addressRegion: a.state ?? undefined,
    postalCode: a.pincode ?? undefined,
    addressCountry: "IN",
  });
}

export type DealerSchemaInput = {
  slug: string;
  name: string;
  legalName?: string | null;
  tagline?: string | null;
  about?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  linkedinUrl?: string | null;
} & Address;

/**
 * The showroom itself, as a local business.
 *
 * AutoDealer rather than Organization: it is the type Google maps to the local
 * pack, and it is what lets an "used cars near me" result show the dealership's
 * own address and hours rather than the platform's.
 *
 * No aggregateRating is emitted. The testimonials on a showroom are chosen and
 * published by the dealer, and marking dealer-curated praise up as review data
 * is exactly the self-serving pattern Google issues manual actions for.
 */
export function autoDealerSchema(
  dealer: DealerSchemaInput,
  opts: {
    hours?: { day: string; open: string; close: string; closed?: boolean }[];
    branches?: (Address & { name: string; phone?: string | null })[];
    priceRange?: string;
  } = {},
): Json {
  const url = absoluteUrl(`/d/${dealer.slug}`);
  const hours = (opts.hours ?? []).filter((h) => !h.closed && h.open && h.close);

  return compact({
    "@type": "AutoDealer",
    "@id": `${url}#dealer`,
    name: dealer.name,
    legalName: dealer.legalName ?? undefined,
    url,
    description: dealer.about?.slice(0, 500) ?? dealer.tagline ?? undefined,
    slogan: dealer.tagline ?? undefined,
    telephone: dealer.phone ?? undefined,
    email: dealer.email ?? undefined,
    logo: dealer.logoUrl ? absoluteUrl(dealer.logoUrl) : undefined,
    image: dealer.coverUrl
      ? absoluteUrl(dealer.coverUrl)
      : dealer.logoUrl
        ? absoluteUrl(dealer.logoUrl)
        : undefined,
    address: postalAddress(dealer),
    areaServed: dealer.city ? { "@type": "City", name: dealer.city } : undefined,
    currenciesAccepted: "INR",
    priceRange: opts.priceRange,
    openingHoursSpecification: hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${h.day}`,
      opens: h.open,
      closes: h.close,
    })),
    sameAs: [
      dealer.website,
      dealer.facebookUrl,
      dealer.instagramUrl,
      dealer.youtubeUrl,
      dealer.linkedinUrl,
      dealer.mapsUrl,
    ].filter((v): v is string => Boolean(v)),
    department: (opts.branches ?? []).map((b) =>
      compact({
        "@type": "AutoDealer",
        name: b.name,
        telephone: b.phone ?? undefined,
        address: postalAddress(b),
      }),
    ),
    // The inventory search this points at is real: /cars?q= is the same filter
    // the showroom's own search box submits to.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${url}/cars?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    parentOrganization: { "@id": `${siteUrl()}/#organization` },
  });
}
