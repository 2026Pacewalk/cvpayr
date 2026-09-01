import "server-only";
import { db } from "@/lib/db";
import { startOfDay, endOfDay, addDays } from "@/lib/utils";
import { LEAD_STAGE_META, type LeadStage } from "@/lib/constants";
import { ageingReport } from "./inventory";

type Scope = { dealerId: string; branchIds?: string[]; ownerId?: string };

function branchWhere(scope: Scope) {
  return scope.branchIds?.length ? { branchId: { in: scope.branchIds } } : {};
}

export async function getDashboard(scope: Scope) {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const bw = branchWhere(scope);
  const leadScope = { dealerId: scope.dealerId, ...bw, ...(scope.ownerId ? { ownerId: scope.ownerId } : {}) };

  const [
    totalStock,
    available,
    reserved,
    booked,
    soldTotal,
    stockValue,
    newLeads,
    todayLeads,
    openLeads,
    todayFollowUps,
    overdueFollowUps,
    upcomingTestDrives,
    monthBookings,
    monthSales,
    monthSaleAgg,
  ] = await Promise.all([
    db.vehicle.count({ where: { dealerId: scope.dealerId, ...bw, status: { not: "sold" } } }),
    db.vehicle.count({ where: { dealerId: scope.dealerId, ...bw, status: "available" } }),
    db.vehicle.count({ where: { dealerId: scope.dealerId, ...bw, status: "reserved" } }),
    db.vehicle.count({ where: { dealerId: scope.dealerId, ...bw, status: "booked" } }),
    db.vehicle.count({ where: { dealerId: scope.dealerId, ...bw, status: "sold" } }),
    db.vehicle.aggregate({
      where: { dealerId: scope.dealerId, ...bw, status: { in: ["available", "reserved", "booked"] } },
      _sum: { sellingPrice: true },
    }),
    db.lead.count({ where: { ...leadScope, stage: "new" } }),
    db.lead.count({ where: { ...leadScope, createdAt: { gte: dayStart, lte: dayEnd } } }),
    db.lead.count({ where: { ...leadScope, stage: { notIn: ["won", "lost", "not_interested"] } } }),
    db.followUp.count({
      where: {
        dealerId: scope.dealerId,
        status: "pending",
        dueAt: { gte: dayStart, lte: dayEnd },
        ...(scope.ownerId ? { assignedToId: scope.ownerId } : {}),
      },
    }),
    db.followUp.count({
      where: {
        dealerId: scope.dealerId,
        status: "pending",
        dueAt: { lt: dayStart },
        ...(scope.ownerId ? { assignedToId: scope.ownerId } : {}),
      },
    }),
    db.testDrive.count({
      where: {
        dealerId: scope.dealerId,
        ...bw,
        status: { in: ["requested", "confirmed"] },
        scheduledAt: { gte: dayStart },
      },
    }),
    db.booking.count({ where: { dealerId: scope.dealerId, ...bw, bookedAt: { gte: monthStart } } }),
    db.sale.count({ where: { dealerId: scope.dealerId, ...bw, soldAt: { gte: monthStart } } }),
    db.sale.aggregate({
      where: { dealerId: scope.dealerId, ...bw, soldAt: { gte: monthStart } },
      _sum: { salePrice: true, grossProfit: true },
    }),
  ]);

  return {
    inventory: {
      total: totalStock,
      available,
      reserved,
      booked,
      sold: soldTotal,
      value: stockValue._sum.sellingPrice ?? 0,
    },
    leads: { new: newLeads, today: todayLeads, open: openLeads },
    followUps: { today: todayFollowUps, overdue: overdueFollowUps },
    testDrives: { upcoming: upcomingTestDrives },
    sales: {
      monthBookings,
      monthSales,
      monthRevenue: monthSaleAgg._sum.salePrice ?? 0,
      monthProfit: monthSaleAgg._sum.grossProfit ?? 0,
    },
  };
}

/** Leads and sales counted per day for the last `days` days. */
export async function getTrends(scope: Scope, days = 30) {
  const from = startOfDay(addDays(new Date(), -days + 1));
  const bw = branchWhere(scope);

  const [leads, sales] = await Promise.all([
    db.lead.findMany({
      where: { dealerId: scope.dealerId, ...bw, createdAt: { gte: from } },
      select: { createdAt: true },
    }),
    db.sale.findMany({
      where: { dealerId: scope.dealerId, ...bw, soldAt: { gte: from } },
      select: { soldAt: true, salePrice: true },
    }),
  ]);

  const buckets = new Map<string, { date: string; label: string; leads: number; sales: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      leads: 0,
      sales: 0,
      revenue: 0,
    });
  }
  for (const l of leads) {
    const k = l.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(k);
    if (b) b.leads++;
  }
  for (const s of sales) {
    const k = s.soldAt.toISOString().slice(0, 10);
    const b = buckets.get(k);
    if (b) {
      b.sales++;
      b.revenue += s.salePrice;
    }
  }
  return [...buckets.values()];
}

export async function getLeadSourceBreakdown(scope: Scope, days = 90) {
  const from = addDays(new Date(), -days);
  const rows = await db.lead.groupBy({
    by: ["source"],
    where: { dealerId: scope.dealerId, ...branchWhere(scope), createdAt: { gte: from } },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ source: r.source, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function getPipelineCounts(scope: Scope) {
  const rows = await db.lead.groupBy({
    by: ["stage"],
    where: {
      dealerId: scope.dealerId,
      ...branchWhere(scope),
      ...(scope.ownerId ? { ownerId: scope.ownerId } : {}),
    },
    _count: { _all: true },
  });
  const map = new Map(rows.map((r) => [r.stage, r._count._all]));
  return (Object.keys(LEAD_STAGE_META) as LeadStage[]).map((stage) => ({
    stage,
    label: LEAD_STAGE_META[stage].short,
    count: map.get(stage) ?? 0,
  }));
}

export async function getBranchPerformance(dealerId: string, days = 90) {
  const from = addDays(new Date(), -days);
  const branches = await db.branch.findMany({
    where: { dealerId },
    select: { id: true, name: true, city: true },
    orderBy: { sortOrder: "asc" },
  });

  return Promise.all(
    branches.map(async (b) => {
      const [stock, leads, sales, agg] = await Promise.all([
        db.vehicle.count({ where: { dealerId, branchId: b.id, status: { in: ["available", "reserved", "booked"] } } }),
        db.lead.count({ where: { dealerId, branchId: b.id, createdAt: { gte: from } } }),
        db.sale.count({ where: { dealerId, branchId: b.id, soldAt: { gte: from } } }),
        db.sale.aggregate({
          where: { dealerId, branchId: b.id, soldAt: { gte: from } },
          _sum: { salePrice: true, grossProfit: true },
        }),
      ]);
      return {
        ...b,
        stock,
        leads,
        sales,
        revenue: agg._sum.salePrice ?? 0,
        profit: agg._sum.grossProfit ?? 0,
        conversion: leads ? Math.round((sales / leads) * 1000) / 10 : 0,
      };
    }),
  );
}

export async function getStaffPerformance(dealerId: string, days = 90) {
  const from = addDays(new Date(), -days);
  const staff = await db.user.findMany({
    where: { dealerId, isActive: true },
    select: { id: true, name: true, avatarUrl: true, role: { select: { name: true } } },
  });

  const rows = await Promise.all(
    staff.map(async (u) => {
      const [leads, won, sales, agg, followUps] = await Promise.all([
        db.lead.count({ where: { dealerId, ownerId: u.id, createdAt: { gte: from } } }),
        db.lead.count({ where: { dealerId, ownerId: u.id, stage: "won", closedAt: { gte: from } } }),
        db.sale.count({ where: { dealerId, salesExecutiveId: u.id, soldAt: { gte: from } } }),
        db.sale.aggregate({
          where: { dealerId, salesExecutiveId: u.id, soldAt: { gte: from } },
          _sum: { salePrice: true, grossProfit: true },
        }),
        db.followUp.count({ where: { dealerId, assignedToId: u.id, status: "pending" } }),
      ]);
      return {
        ...u,
        leads,
        won,
        sales,
        revenue: agg._sum.salePrice ?? 0,
        profit: agg._sum.grossProfit ?? 0,
        pendingFollowUps: followUps,
        conversion: leads ? Math.round((won / leads) * 1000) / 10 : 0,
      };
    }),
  );

  return rows.filter((r) => r.leads || r.sales || r.pendingFollowUps).sort((a, b) => b.sales - a.sales);
}

export async function getPopularVehicles(dealerId: string, take = 6) {
  return db.vehicle.findMany({
    where: { dealerId, status: { in: ["available", "reserved", "booked"] } },
    select: {
      id: true, stockId: true, year: true, make: true, model: true, variant: true,
      sellingPrice: true, viewCount: true, enquiryCount: true, status: true,
      images: { select: { url: true }, where: { kind: "photo" }, orderBy: [{ isCover: "desc" as const }], take: 1 },
    },
    orderBy: [{ enquiryCount: "desc" }, { viewCount: "desc" }],
    take,
  });
}

export async function getDashboardLists(scope: Scope) {
  const dayEnd = endOfDay(new Date());
  const bw = branchWhere(scope);

  const [recentLeads, recentVehicles, followUps, testDrives, ageing] = await Promise.all([
    db.lead.findMany({
      where: { dealerId: scope.dealerId, ...bw, ...(scope.ownerId ? { ownerId: scope.ownerId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true, reference: true, stage: true, priority: true, source: true, createdAt: true,
        customer: { select: { name: true, phone: true, city: true } },
        vehicle: { select: { year: true, make: true, model: true, variant: true } },
        branch: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    db.vehicle.findMany({
      where: { dealerId: scope.dealerId, ...bw },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, stockId: true, year: true, make: true, model: true, variant: true,
        sellingPrice: true, status: true, createdAt: true,
        branch: { select: { name: true } },
        images: { select: { url: true }, where: { kind: "photo" }, orderBy: [{ isCover: "desc" as const }], take: 1 },
      },
    }),
    db.followUp.findMany({
      where: {
        dealerId: scope.dealerId,
        status: "pending",
        dueAt: { lte: dayEnd },
        ...(scope.ownerId ? { assignedToId: scope.ownerId } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 8,
      select: {
        id: true, dueAt: true, type: true, note: true,
        lead: {
          select: {
            id: true, reference: true, stage: true,
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { year: true, make: true, model: true } },
          },
        },
        assignedTo: { select: { name: true } },
      },
    }),
    db.testDrive.findMany({
      where: {
        dealerId: scope.dealerId,
        ...bw,
        status: { in: ["requested", "confirmed"] },
        scheduledAt: { gte: startOfDay(new Date()) },
      },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      select: {
        id: true, scheduledAt: true, status: true,
        customer: { select: { name: true, phone: true } },
        vehicle: { select: { id: true, year: true, make: true, model: true, stockId: true } },
        branch: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    ageingReport(scope.dealerId, scope.branchIds),
  ]);

  return { recentLeads, recentVehicles, followUps, testDrives, ageing };
}
