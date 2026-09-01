import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

export type WorkingHour = { day: string; open: string; close: string; closed?: boolean };
export type WhyChooseUsItem = { icon: string; title: string; body: string };

/**
 * Loads a dealer public profile by slug. Suspended and expired accounts stop
 * serving their public showroom — the platform, not the dealer, owns that switch.
 */
export const getDealerBySlug = cache(async (slug: string) => {
  const dealer = await db.dealer.findUnique({
    where: { slug },
    include: {
      websiteSettings: true,
      branches: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      subscription: { include: { plan: true } },
    },
  });

  if (!dealer) return null;
  if (dealer.status === "suspended" || dealer.status === "expired") return null;
  if (dealer.websiteSettings && !dealer.websiteSettings.isPublished) return null;

  return dealer;
});

export type PublicDealer = NonNullable<Awaited<ReturnType<typeof getDealerBySlug>>>;

export function dealerWorkingHours(dealer: { workingHours: string | null }): WorkingHour[] {
  return safeJsonParse<WorkingHour[]>(dealer.workingHours, []);
}

export function dealerWhyChooseUs(dealer: {
  websiteSettings?: { whyChooseUs: string | null } | null;
}): WhyChooseUsItem[] {
  return safeJsonParse<WhyChooseUsItem[]>(dealer.websiteSettings?.whyChooseUs, []);
}

export function branchImages(branch: { images: string | null }): string[] {
  return safeJsonParse<string[]>(branch.images, []);
}

/** Headline numbers shown on the public homepage. */
export const getDealerStats = cache(async (dealerId: string) => {
  const [available, sold, branches, years] = await Promise.all([
    db.vehicle.count({ where: { dealerId, status: { in: ["available", "reserved", "booked"] } } }),
    db.sale.count({ where: { dealerId } }),
    db.branch.count({ where: { dealerId, isActive: true } }),
    db.dealer.findUnique({ where: { id: dealerId }, select: { createdAt: true } }),
  ]);

  return {
    available,
    sold,
    branches,
    happyCustomers: await db.customer.count({ where: { dealerId } }),
    since: years?.createdAt.getFullYear() ?? new Date().getFullYear(),
  };
});

export const getPublishedTestimonials = cache(async (dealerId: string) =>
  db.testimonial.findMany({
    where: { dealerId, isPublished: true },
    orderBy: { sortOrder: "asc" },
    take: 6,
  }),
);

/** Brand tiles for the homepage, ordered by live stock count. */
export const getPopularBrands = cache(async (dealerId: string) => {
  const rows = await db.vehicle.groupBy({
    by: ["make"],
    where: { dealerId, status: { in: ["available", "reserved", "booked"] } },
    _count: { _all: true },
    orderBy: { _count: { make: "desc" } },
    take: 10,
  });
  return rows.map((r) => ({ make: r.make, count: r._count._all }));
});

export const getBodyTypeCounts = cache(async (dealerId: string) => {
  const rows = await db.vehicle.groupBy({
    by: ["bodyType"],
    where: { dealerId, status: { in: ["available", "reserved", "booked"] } },
    _count: { _all: true },
    orderBy: { _count: { bodyType: "desc" } },
  });
  return rows.map((r) => ({ bodyType: r.bodyType, count: r._count._all }));
});

/** Resolves the dealer for the signed-in CRM user. */
export const getDealerForUser = cache(async (dealerId: string) =>
  db.dealer.findUnique({
    where: { id: dealerId },
    include: {
      websiteSettings: true,
      subscription: { include: { plan: true } },
      _count: { select: { branches: true, users: true, vehicles: true } },
    },
  }),
);

export const getDealerBranches = cache(async (dealerId: string, onlyActive = false) =>
  db.branch.findMany({
    where: { dealerId, ...(onlyActive ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      manager: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { vehicles: true, leads: true, members: true } },
    },
  }),
);

export const getDealerStaff = cache(async (dealerId: string) =>
  db.user.findMany({
    where: { dealerId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      role: { select: { id: true, key: true, name: true } },
      branches: { include: { branch: { select: { id: true, name: true, city: true } } } },
      _count: { select: { assignedLeads: true, sales: true } },
    },
  }),
);
