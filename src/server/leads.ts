import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LEAD_STAGE_META, type LeadStage } from "@/lib/constants";
import { normalisePhone, vehicleTitle } from "@/lib/utils";
import { notify, notifyRecipients, audit } from "./events";
import { PERMISSIONS } from "@/lib/permissions";

/* ------------------------------------------------------------------ */
/* REFERENCES                                                          */
/* ------------------------------------------------------------------ */

async function nextReference(dealerId: string, prefix: "LD" | "BK" | "SL") {
  const table = prefix === "LD" ? db.lead : prefix === "BK" ? db.booking : db.sale;
  // @ts-expect-error the three delegates share the count signature we need
  const count: number = await table.count({ where: { dealerId } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* CUSTOMER DEDUPLICATION                                              */
/* ------------------------------------------------------------------ */

/**
 * Finds an existing customer by normalised mobile number, or creates one.
 * A repeat enquiry from the same number always attaches to the same customer
 * record so their full history stays in one place.
 */
export async function upsertCustomer(input: {
  dealerId: string;
  name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
}) {
  const phone = normalisePhone(input.phone);
  const existing = await db.customer.findFirst({ where: { dealerId: input.dealerId, phone } });

  if (existing) {
    // Enrich blanks without overwriting what the dealer already curated.
    const patch: Prisma.CustomerUpdateInput = {};
    if (!existing.email && input.email) patch.email = input.email;
    if (!existing.city && input.city) patch.city = input.city;
    if (!existing.whatsapp && input.whatsapp) patch.whatsapp = normalisePhone(input.whatsapp);
    if (Object.keys(patch).length) {
      return { customer: await db.customer.update({ where: { id: existing.id }, data: patch }), isNew: false };
    }
    return { customer: existing, isNew: false };
  }

  const customer = await db.customer.create({
    data: {
      dealerId: input.dealerId,
      name: input.name.trim(),
      phone,
      whatsapp: input.whatsapp ? normalisePhone(input.whatsapp) : null,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
    },
  });
  return { customer, isNew: true };
}

/* ------------------------------------------------------------------ */
/* LEAD CAPTURE — the entry point for every public enquiry             */
/* ------------------------------------------------------------------ */

export type EnquiryInput = {
  dealerId: string;
  name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  message?: string | null;
  vehicleId?: string | null;
  branchId?: string | null;
  source?: string;
  sourceDetail?: string | null;
  requirement?: string | null;
  pageUrl?: string | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
  /** When set, a test drive request is created alongside the lead. */
  testDriveAt?: Date | null;
};

/**
 * Creates (or updates) a customer, then a lead, an opening activity and a
 * notification. This is the single funnel that the public website, the WhatsApp
 * CTA and the manual "Add Lead" form all pass through.
 */
export async function captureEnquiry(input: EnquiryInput) {
  const { customer, isNew } = await upsertCustomer(input);

  const vehicle = input.vehicleId
    ? await db.vehicle.findFirst({
        where: { id: input.vehicleId, dealerId: input.dealerId },
        select: { id: true, year: true, make: true, model: true, variant: true, stockId: true, branchId: true },
      })
    : null;

  const branchId = input.branchId ?? vehicle?.branchId ?? null;

  // An open lead for the same customer + vehicle is a duplicate: log activity
  // on it rather than fragmenting the pipeline.
  const openDuplicate = await db.lead.findFirst({
    where: {
      dealerId: input.dealerId,
      customerId: customer.id,
      vehicleId: vehicle?.id ?? null,
      stage: { notIn: ["won", "lost", "not_interested"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (openDuplicate) {
    await db.leadActivity.create({
      data: {
        dealerId: input.dealerId,
        leadId: openDuplicate.id,
        type: "note",
        title: "Repeat enquiry received",
        body: input.message ?? `New enquiry via ${input.source ?? "website"}.`,
        meta: JSON.stringify({ source: input.source, pageUrl: input.pageUrl }),
      },
    });
    await db.lead.update({
      where: { id: openDuplicate.id },
      data: { lastActivityAt: new Date(), priority: "high" },
    });
    await notifyRecipients(
      {
        dealerId: input.dealerId,
        permissions: [PERMISSIONS.LEADS_VIEW_ALL],
        branchId: openDuplicate.branchId,
        includeUserIds: [openDuplicate.ownerId],
      },
      {
        type: "lead.new",
        title: `Repeat enquiry from ${customer.name}`,
        body: vehicle ? `Asked again about ${vehicleTitle(vehicle)}` : "Sent another enquiry",
        link: `/leads/${openDuplicate.id}`,
        priority: "high",
        entityType: "lead",
        entityId: openDuplicate.id,
        meta: { phone: customer.phone, customerName: customer.name },
      },
    );
    return { lead: openDuplicate, customer, isNewCustomer: isNew, isDuplicate: true };
  }

  const reference = await nextReference(input.dealerId, "LD");

  const lead = await db.lead.create({
    data: {
      dealerId: input.dealerId,
      reference,
      customerId: customer.id,
      vehicleId: vehicle?.id ?? null,
      branchId,
      stage: "new",
      priority: vehicle ? "high" : "medium",
      source: input.source ?? "website",
      sourceDetail: input.sourceDetail,
      message: input.message,
      requirement: input.requirement,
      pageUrl: input.pageUrl,
      utmSource: input.utm?.source,
      utmMedium: input.utm?.medium,
      utmCampaign: input.utm?.campaign,
      lastActivityAt: new Date(),
    },
  });

  await db.leadActivity.create({
    data: {
      dealerId: input.dealerId,
      leadId: lead.id,
      type: "system",
      title: "Lead created",
      body: vehicle
        ? `Enquiry for ${vehicleTitle(vehicle)} (${vehicle.stockId})`
        : `General enquiry via ${input.source ?? "website"}`,
      meta: JSON.stringify({ source: input.source, pageUrl: input.pageUrl, utm: input.utm }),
    },
  });

  if (vehicle) {
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: { enquiryCount: { increment: 1 } },
    });
  }

  if (input.testDriveAt) {
    await db.testDrive.create({
      data: {
        dealerId: input.dealerId,
        leadId: lead.id,
        customerId: customer.id,
        vehicleId: vehicle?.id ?? null,
        branchId,
        scheduledAt: input.testDriveAt,
        status: "requested",
      },
    });
    await db.lead.update({ where: { id: lead.id }, data: { stage: "test_drive_scheduled" } });
    await db.leadActivity.create({
      data: {
        dealerId: input.dealerId,
        leadId: lead.id,
        type: "test_drive",
        title: "Test drive requested",
        body: input.testDriveAt.toLocaleString("en-IN"),
      },
    });
  }

  const branch = branchId
    ? await db.branch.findUnique({ where: { id: branchId }, select: { name: true } })
    : null;

  await notifyRecipients(
    {
      dealerId: input.dealerId,
      permissions: [PERMISSIONS.LEADS_VIEW_ALL, PERMISSIONS.LEADS_ASSIGN],
      branchId: branchId,
      includeUserIds: [lead.ownerId],
    },
    {
      type: "lead.new",
      title: `New enquiry received from ${customer.name}`,
      body: vehicle
        ? `For ${vehicleTitle(vehicle)}${branch ? ` at ${branch.name}` : ""}`
        : `General enquiry${branch ? ` at ${branch.name}` : ""}`,
      link: `/leads/${lead.id}`,
      priority: "high",
      entityType: "lead",
      entityId: lead.id,
      meta: {
        phone: customer.phone,
        customerName: customer.name,
        vehicle: vehicle ? vehicleTitle(vehicle) : null,
      },
    },
  );

  return { lead, customer, isNewCustomer: isNew, isDuplicate: false };
}

/* ------------------------------------------------------------------ */
/* STAGE TRANSITIONS                                                   */
/* ------------------------------------------------------------------ */

/**
 * Moves a lead to a new stage, records the change on the timeline and applies
 * the linked side effects (vehicle status, close date).
 */
export async function moveLeadStage(input: {
  dealerId: string;
  leadId: string;
  stage: LeadStage;
  userId?: string | null;
  lostReason?: string | null;
}) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, dealerId: input.dealerId },
    include: { vehicle: { select: { id: true, status: true } } },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.stage === input.stage) return lead;

  const from = LEAD_STAGE_META[lead.stage as LeadStage]?.label ?? lead.stage;
  const to = LEAD_STAGE_META[input.stage].label;
  const closing = LEAD_STAGE_META[input.stage].group !== "open";

  const updated = await db.lead.update({
    where: { id: lead.id },
    data: {
      stage: input.stage,
      lostReason: input.stage === "lost" || input.stage === "not_interested" ? input.lostReason : null,
      closedAt: closing ? new Date() : null,
      lastActivityAt: new Date(),
    },
  });

  await db.leadActivity.create({
    data: {
      dealerId: input.dealerId,
      leadId: lead.id,
      userId: input.userId,
      type: "stage_change",
      title: `Stage changed: ${from} → ${to}`,
      body: input.lostReason ? `Reason: ${input.lostReason}` : null,
    },
  });

  // Reserve the vehicle when a deal reaches booking, release it when lost.
  if (lead.vehicle) {
    if (input.stage === "booking_pending" && lead.vehicle.status === "available") {
      await setVehicleStatus(input.dealerId, lead.vehicle.id, "reserved", input.userId);
    }
    if (
      (input.stage === "lost" || input.stage === "not_interested") &&
      lead.vehicle.status === "reserved"
    ) {
      const otherActive = await db.lead.count({
        where: {
          vehicleId: lead.vehicle.id,
          id: { not: lead.id },
          stage: { in: ["booking_pending", "booked"] },
        },
      });
      if (!otherActive) await setVehicleStatus(input.dealerId, lead.vehicle.id, "available", input.userId);
    }
  }

  await audit({
    dealerId: input.dealerId,
    userId: input.userId,
    action: "status_change",
    entity: "lead",
    entityId: lead.id,
    summary: `${lead.reference}: ${from} → ${to}`,
  });

  return updated;
}

export async function setVehicleStatus(
  dealerId: string,
  vehicleId: string,
  status: string,
  userId?: string | null,
) {
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, dealerId } });
  if (!vehicle) return null;

  const updated = await db.vehicle.update({
    where: { id: vehicleId },
    data: {
      status,
      listedAt: status === "available" && !vehicle.listedAt ? new Date() : vehicle.listedAt,
      soldAt: status === "sold" ? (vehicle.soldAt ?? new Date()) : status === "available" ? null : vehicle.soldAt,
    },
  });

  if (status === "reserved" || status === "booked" || status === "sold") {
    await notifyRecipients(
      {
        dealerId,
        permissions: [PERMISSIONS.INVENTORY_VIEW],
        branchId: vehicle.branchId,
        excludeUserIds: [userId],
      },
      {
        type: status === "sold" ? "vehicle.sold" : status === "booked" ? "vehicle.booked" : "vehicle.reserved",
        title: `${vehicle.stockId} marked ${status}`,
        body: vehicleTitle(vehicle),
        link: `/inventory/${vehicle.id}`,
        actorId: userId,
        entityType: "vehicle",
        entityId: vehicle.id,
      },
    );
  }

  await audit({
    dealerId,
    userId,
    action: "status_change",
    entity: "vehicle",
    entityId: vehicleId,
    summary: `${vehicle.stockId} ${vehicle.status} → ${status}`,
  });

  return updated;
}

/* ------------------------------------------------------------------ */
/* ASSIGNMENT                                                          */
/* ------------------------------------------------------------------ */

export async function assignLead(input: {
  dealerId: string;
  leadId: string;
  ownerId: string | null;
  actorId?: string | null;
}) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, dealerId: input.dealerId },
    include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
  });
  if (!lead) throw new Error("Lead not found");

  const newOwner = input.ownerId
    ? await db.user.findFirst({
        where: { id: input.ownerId, dealerId: input.dealerId },
        select: { id: true, name: true },
      })
    : null;

  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { ownerId: newOwner?.id ?? null, lastActivityAt: new Date() },
  });

  await db.leadActivity.create({
    data: {
      dealerId: input.dealerId,
      leadId: lead.id,
      userId: input.actorId,
      type: "assignment",
      title: newOwner
        ? `Assigned to ${newOwner.name}${lead.owner ? ` (was ${lead.owner.name})` : ""}`
        : "Unassigned",
    },
  });

  if (newOwner) {
    await notify({
      dealerId: input.dealerId,
      userId: newOwner.id,
      type: "lead.assigned",
      title: `Lead assigned to you: ${lead.customer.name}`,
      body: `Reference ${lead.reference}. Respond within 30 minutes to stay inside your response target.`,
      link: `/leads/${lead.id}`,
      priority: "high",
      branchId: lead.branchId,
      actorId: input.actorId,
      entityType: "lead",
      entityId: lead.id,
      meta: { customerName: lead.customer.name, reference: lead.reference },
    });
  }

  return updated;
}

/**
 * Round-robin assignment across the sales executives of a branch.
 * Picks the eligible user with the fewest open leads, so distribution stays fair
 * even when staff join or leave mid-cycle.
 */
export async function autoAssignLead(input: {
  dealerId: string;
  leadId: string;
  branchId?: string | null;
  actorId?: string | null;
}) {
  const candidates = await db.user.findMany({
    where: {
      dealerId: input.dealerId,
      isActive: true,
      role: { key: { in: ["sales_executive", "branch_manager"] } },
      ...(input.branchId
        ? { OR: [{ branches: { none: {} } }, { branches: { some: { branchId: input.branchId } } }] }
        : {}),
    },
    select: {
      id: true,
      _count: { select: { assignedLeads: { where: { stage: { notIn: ["won", "lost", "not_interested"] } } } } },
    },
  });

  if (!candidates.length) return null;
  const target = candidates.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)[0];
  return assignLead({ ...input, ownerId: target.id });
}

/* ------------------------------------------------------------------ */
/* QUERIES                                                             */
/* ------------------------------------------------------------------ */

export const leadListSelect = {
  id: true,
  reference: true,
  stage: true,
  priority: true,
  source: true,
  createdAt: true,
  lastActivityAt: true,
  nextFollowUpAt: true,
  message: true,
  requirement: true,
  customer: { select: { id: true, name: true, phone: true, whatsapp: true, city: true } },
  vehicle: {
    select: {
      id: true, stockId: true, year: true, make: true, model: true, variant: true, sellingPrice: true,
      images: { select: { url: true }, where: { kind: "photo" }, orderBy: [{ isCover: "desc" as const }], take: 1 },
    },
  },
  branch: { select: { id: true, name: true, city: true } },
  owner: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { activities: true, followUps: true } },
} satisfies Prisma.LeadSelect;

export type LeadListItem = Prisma.LeadGetPayload<{ select: typeof leadListSelect }>;

export type LeadFilters = {
  q?: string;
  stage?: string;
  branchId?: string;
  ownerId?: string;
  source?: string;
  priority?: string;
  vehicleId?: string;
  bucket?: "today" | "overdue" | "unassigned" | "uncontacted" | "open" | "all";
  /** Action-centre filter: live opportunities with nothing booked next. */
  needs?: string;
  page?: number;
};

export function buildLeadWhere(
  filters: LeadFilters,
  opts: { dealerId: string; allowedBranchIds?: string[]; restrictToOwnerId?: string },
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { dealerId: opts.dealerId };
  const and: Prisma.LeadWhereInput[] = [];

  if (opts.restrictToOwnerId) where.ownerId = opts.restrictToOwnerId;
  if (opts.allowedBranchIds?.length) {
    and.push({ OR: [{ branchId: { in: opts.allowedBranchIds } }, { branchId: null }] });
  }

  if (filters.stage) where.stage = filters.stage;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.ownerId) where.ownerId = filters.ownerId === "unassigned" ? null : filters.ownerId;
  if (filters.source) where.source = filters.source;
  if (filters.priority) where.priority = filters.priority;
  if (filters.vehicleId) where.vehicleId = filters.vehicleId;

  if (filters.bucket === "open") where.stage = { notIn: ["won", "lost", "not_interested"] };
  if (filters.bucket === "unassigned") where.ownerId = null;
  if (filters.bucket === "today") {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    and.push({ nextFollowUpAt: { lte: end }, stage: { notIn: ["won", "lost", "not_interested"] } });
  }
  if (filters.bucket === "overdue") {
    and.push({ nextFollowUpAt: { lt: new Date() }, stage: { notIn: ["won", "lost", "not_interested"] } });
  }
  // Nobody has replied to these yet — the SLA queue.
  if (filters.bucket === "uncontacted") {
    and.push({ firstResponseAt: null, stage: { notIn: ["won", "lost", "not_interested"] } });
  }

  // An open opportunity with no future follow-up. The quietest way to lose a
  // deal, and the action centre links straight here.
  if (filters.needs === "next_step") {
    and.push({
      stage: { in: ["interested", "follow_up", "test_drive_completed", "negotiation"] },
      OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lt: new Date() } }],
    });
  }

  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { reference: { contains: q } },
        { customer: { name: { contains: q } } },
        { customer: { phone: { contains: q } } },
        { message: { contains: q } },
        { requirement: { contains: q } },
        { vehicle: { model: { contains: q } } },
        { vehicle: { make: { contains: q } } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

/* ------------------------------------------------------------------ */
/* OUTREACH & RESPONSE TIME                                            */
/* ------------------------------------------------------------------ */

export type OutreachChannel = "whatsapp" | "call" | "sms" | "email";

/**
 * Records an outbound touch on a lead and stamps the response-time milestones.
 *
 * `firstResponseAt` is set the first time staff reach out by any channel.
 * `firstContactAt` is set the first time a human actually connected — a
 * WhatsApp message counts as a response but not as contact, because we cannot
 * know it was read.
 */
export async function recordOutreach(input: {
  dealerId: string;
  leadId: string;
  userId?: string | null;
  channel: OutreachChannel;
  title: string;
  body?: string | null;
  /** True when we know a person was actually reached (a connected call). */
  connected?: boolean;
  meta?: unknown;
}) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, dealerId: input.dealerId },
    select: { id: true, firstResponseAt: true, firstContactAt: true, stage: true },
  });
  if (!lead) return null;

  const now = new Date();

  await db.leadActivity.create({
    data: {
      dealerId: input.dealerId,
      leadId: input.leadId,
      userId: input.userId ?? null,
      type: input.channel === "call" ? "call" : input.channel,
      title: input.title,
      body: input.body ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });

  await db.lead.update({
    where: { id: input.leadId },
    data: {
      lastActivityAt: now,
      firstResponseAt: lead.firstResponseAt ?? now,
      firstContactAt: input.connected ? (lead.firstContactAt ?? now) : lead.firstContactAt,
      // A brand-new lead that has now been contacted is no longer "new".
      stage: lead.stage === "new" ? "contacted" : lead.stage,
    },
  });

  return { firstResponse: !lead.firstResponseAt };
}

/** Minutes a lead waited (or has been waiting) for its first staff response. */
export function responseMinutes(lead: {
  createdAt: Date;
  firstResponseAt: Date | null;
}): number {
  const end = lead.firstResponseAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - lead.createdAt.getTime()) / 60000));
}

/**
 * Response-time picture for a dealership: how fast the team replies, and which
 * leads are still sitting untouched right now.
 */
export async function getResponseStats(scope: {
  dealerId: string;
  branchIds?: string[];
  ownerId?: string;
}) {
  const where = {
    dealerId: scope.dealerId,
    ...(scope.branchIds?.length ? { branchId: { in: scope.branchIds } } : {}),
    ...(scope.ownerId ? { ownerId: scope.ownerId } : {}),
  };

  const now = Date.now();
  const [responded, waiting] = await Promise.all([
    db.lead.findMany({
      where: { ...where, firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.lead.findMany({
      where: {
        ...where,
        firstResponseAt: null,
        stage: { notIn: ["won", "lost", "not_interested"] },
      },
      select: {
        id: true,
        reference: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
        vehicle: { select: { year: true, make: true, model: true } },
        owner: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const durations = responded.map((l) => responseMinutes(l));
  const averageMinutes = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : null;

  const withWait = waiting.map((l) => ({
    ...l,
    waitingMinutes: Math.round((now - l.createdAt.getTime()) / 60000),
  }));

  return {
    averageMinutes,
    uncontacted: withWait.length,
    over30: withWait.filter((l) => l.waitingMinutes > 30).length,
    over60: withWait.filter((l) => l.waitingMinutes > 60).length,
    oldestMinutes: withWait[0]?.waitingMinutes ?? 0,
    queue: withWait,
  };
}
