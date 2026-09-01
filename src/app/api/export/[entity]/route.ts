import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can, canSeeCost, canSeeMargin } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { parseVehicleFilters, buildVehicleWhere, vehicleOrderBy, ageingDays } from "@/server/inventory";
import { buildLeadWhere } from "@/server/leads";
import { LEAD_STAGE_META, LEAD_SOURCE_LABELS, type LeadStage } from "@/lib/constants";
import { vehicleTitle } from "@/lib/utils";

/**
 * CSV export. Every column is resolved against the caller's permissions, so an
 * export can never leak cost or margin to a role that cannot see it on screen.
 * The same shape feeds future XLSX/PDF writers.
 */

function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const value = String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  // BOM keeps Excel happy with the rupee sign and Indian names.
  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const session = await getSession();
  if (!session?.dealerId) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (!can(session, PERMISSIONS.REPORTS_EXPORT)) {
    return NextResponse.json({ error: "You do not have export permission" }, { status: 403 });
  }

  const { entity } = await params;
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const dealerId = session.dealerId;
  const allowedBranchIds = session.branchIds.length ? session.branchIds : undefined;
  const stamp = new Date().toISOString().slice(0, 10);

  if (entity === "inventory") {
    const filters = parseVehicleFilters(sp);
    const where = buildVehicleWhere(filters, { dealerId, allowedBranchIds });
    const vehicles = await db.vehicle.findMany({
      where,
      orderBy: vehicleOrderBy(filters.sort),
      include: { branch: { select: { name: true } } },
      take: 5000,
    });

    const showCost = canSeeCost(session);
    const showMargin = canSeeMargin(session);

    const header = [
      "Stock ID", "Registration", "Vehicle", "Year", "Fuel", "Transmission", "Body type",
      "Colour", "Km driven", "Owners", "Branch", "Status", "Selling price",
      ...(showCost ? ["Purchase price", "Refurbishment", "Min acceptable"] : []),
      ...(showMargin ? ["Gross profit", "Margin %"] : []),
      "Days in stock", "Enquiries", "Views", "Listed on",
    ];

    const rows = vehicles.map((v) => {
      const cost = (v.purchasePrice ?? 0) + v.refurbishmentCost;
      const profit = cost ? v.sellingPrice - cost : null;
      return [
        v.stockId, v.registrationNumber, vehicleTitle(v), v.year, v.fuelType, v.transmission,
        v.bodyType, v.colour, v.kmDriven, v.ownership, v.branch.name, v.status, v.sellingPrice,
        ...(showCost ? [v.purchasePrice, v.refurbishmentCost, v.minAcceptablePrice] : []),
        ...(showMargin ? [profit, profit && cost ? Math.round((profit / cost) * 1000) / 10 : null] : []),
        ageingDays(v), v.enquiryCount, v.viewCount,
        (v.listedAt ?? v.createdAt).toISOString().slice(0, 10),
      ];
    });

    return csvResponse(`inventory-${stamp}.csv`, [header, ...rows]);
  }

  if (entity === "leads") {
    if (!can(session, PERMISSIONS.LEADS_VIEW)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    const where = buildLeadWhere(
      {
        q: sp.q, stage: sp.stage, branchId: sp.branch, ownerId: sp.owner,
        source: sp.source, priority: sp.priority,
        bucket: sp.bucket as "today" | "overdue" | "unassigned" | "open" | "all" | undefined,
      },
      {
        dealerId,
        allowedBranchIds,
        restrictToOwnerId: can(session, PERMISSIONS.LEADS_VIEW_ALL) ? undefined : session.id,
      },
    );

    const leads = await db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        vehicle: { select: { stockId: true, year: true, make: true, model: true, variant: true } },
        branch: { select: { name: true } },
        owner: { select: { name: true } },
      },
      take: 5000,
    });

    const header = [
      "Reference", "Created", "Customer", "Phone", "City", "Stage", "Priority", "Source",
      "Vehicle", "Stock ID", "Branch", "Owner", "Next follow-up", "Last activity", "Message", "Lost reason",
    ];

    const rows = leads.map((l) => [
      l.reference,
      l.createdAt.toISOString().slice(0, 10),
      l.customer.name,
      l.customer.phone,
      l.customer.city,
      LEAD_STAGE_META[l.stage as LeadStage]?.label ?? l.stage,
      l.priority,
      LEAD_SOURCE_LABELS[l.source] ?? l.source,
      l.vehicle ? vehicleTitle(l.vehicle) : "",
      l.vehicle?.stockId ?? "",
      l.branch?.name ?? "",
      l.owner?.name ?? "Unassigned",
      l.nextFollowUpAt?.toISOString().slice(0, 10) ?? "",
      l.lastActivityAt.toISOString().slice(0, 10),
      l.message ?? "",
      l.lostReason ?? "",
    ]);

    return csvResponse(`leads-${stamp}.csv`, [header, ...rows]);
  }

  if (entity === "sales") {
    if (!can(session, PERMISSIONS.SALES_VIEW)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    const showMargin = canSeeMargin(session);
    const sales = await db.sale.findMany({
      where: { dealerId, ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}) },
      orderBy: { soldAt: "desc" },
      include: {
        customer: true,
        vehicle: { select: { stockId: true, year: true, make: true, model: true, variant: true } },
        branch: { select: { name: true } },
        salesExecutive: { select: { name: true } },
      },
      take: 5000,
    });

    const header = [
      "Reference", "Sold on", "Customer", "Phone", "Vehicle", "Stock ID", "Branch",
      "Sales executive", "Sale price", "Payment mode", "Finance provider",
      ...(showMargin ? ["Purchase price", "Refurbishment", "Other charges", "Gross profit"] : []),
    ];

    const rows = sales.map((s) => [
      s.reference,
      s.soldAt.toISOString().slice(0, 10),
      s.customer.name,
      s.customer.phone,
      vehicleTitle(s.vehicle),
      s.vehicle.stockId,
      s.branch?.name ?? "",
      s.salesExecutive?.name ?? "",
      s.salePrice,
      s.paymentMode ?? "",
      s.financeProvider ?? "",
      ...(showMargin ? [s.purchasePrice, s.refurbCost, s.otherCharges, s.grossProfit] : []),
    ]);

    return csvResponse(`sales-${stamp}.csv`, [header, ...rows]);
  }

  if (entity === "customers") {
    if (!can(session, PERMISSIONS.CUSTOMERS_VIEW)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    const customers = await db.customer.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true, sales: true, testDrives: true } } },
      take: 5000,
    });

    const header = ["Name", "Phone", "WhatsApp", "Email", "City", "Enquiries", "Test drives", "Purchases", "Added on"];
    const rows = customers.map((c) => [
      c.name, c.phone, c.whatsapp, c.email, c.city,
      c._count.leads, c._count.testDrives, c._count.sales,
      c.createdAt.toISOString().slice(0, 10),
    ]);

    return csvResponse(`customers-${stamp}.csv`, [header, ...rows]);
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 404 });
}
