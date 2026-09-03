import type { MetadataRoute } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";
import { PUBLIC_VEHICLE_STATUSES } from "@/lib/constants";
import { vehicleSlug } from "@/lib/utils";

/**
 * Regenerated hourly rather than per request. Stock moves through the day, but
 * not fast enough to justify two database queries on every crawler hit.
 */
export const revalidate = 3600;

/**
 * A single sitemap holds 50,000 URLs. At roughly seven pages per dealer plus
 * one per car, that is comfortable for hundreds of dealers; past that, split
 * this into a sitemap index with one child per dealer using generateSitemaps().
 * The cap below keeps the file valid rather than silently truncated by a
 * crawler if that day arrives unnoticed.
 */
const MAX_URLS = 45_000;

/**
 * Only showrooms a visitor can actually reach.
 *
 * This mirrors the gating in getDealerBySlug exactly. A sitemap that advertises
 * a suspended dealer's URLs earns soft-404s across the whole domain, so the two
 * must not be allowed to drift apart.
 */
const LIVE_DEALER: Prisma.DealerWhereInput = {
  status: { notIn: ["suspended", "expired"] },
  OR: [{ websiteSettings: { is: null } }, { websiteSettings: { isPublished: true } }],
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const [dealers, vehicles] = await Promise.all([
      db.dealer.findMany({
        where: LIVE_DEALER,
        select: {
          slug: true,
          updatedAt: true,
          websiteSettings: { select: { showFinance: true, showSellYourCar: true } },
        },
      }),
      db.vehicle.findMany({
        where: {
          status: { in: [...PUBLIC_VEHICLE_STATUSES] },
          dealer: LIVE_DEALER,
        },
        select: {
          year: true,
          make: true,
          model: true,
          variant: true,
          stockId: true,
          updatedAt: true,
          dealer: { select: { slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: MAX_URLS,
      }),
    ]);

    for (const dealer of dealers) {
      const base = `/d/${dealer.slug}`;
      const settings = dealer.websiteSettings;

      const pages: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
        ["", 0.9, "daily"],
        ["/cars", 0.9, "daily"],
        ["/branches", 0.6, "monthly"],
        ["/about", 0.5, "monthly"],
        ["/contact", 0.6, "monthly"],
      ];
      // Respect the dealer's own choice to hide these from their showroom.
      if (settings?.showFinance !== false) pages.push(["/finance", 0.5, "monthly"]);
      if (settings?.showSellYourCar !== false) pages.push(["/sell", 0.5, "monthly"]);

      for (const [path, priority, changeFrequency] of pages) {
        entries.push({
          url: absoluteUrl(`${base}${path}`),
          lastModified: dealer.updatedAt,
          changeFrequency,
          priority,
        });
      }
    }

    for (const vehicle of vehicles) {
      entries.push({
        url: absoluteUrl(`/d/${vehicle.dealer.slug}/cars/${vehicleSlug(vehicle)}`),
        lastModified: vehicle.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (error) {
    // A sitemap is worth serving partially. Failing the build or the request
    // over a database hiccup would take the homepage entry down with it.
    console.error("[sitemap] falling back to static entries:", error);
  }

  return entries.slice(0, MAX_URLS);
}
