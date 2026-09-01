"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getTemplates } from "@/server/whatsapp";
import { recordOutreach, type OutreachChannel } from "@/server/leads";
import { audit } from "@/server/events";
import { renderTemplate, DEFAULT_TEMPLATES, type TemplateVars } from "@/lib/whatsapp";
import { formatPrice, formatDate, formatTime, vehicleTitle } from "@/lib/utils";

/* ---------------------------- SEND CONTEXT ---------------------------- */

export type SendContext = {
  templates: { id: string; key: string; name: string; category: string; body: string }[];
  /** Body already rendered for this specific lead/vehicle, keyed by template key. */
  rendered: Record<string, string>;
  phone: string | null;
  customerName: string | null;
};

/**
 * Everything the WhatsApp menu needs for one lead: the dealer's templates with
 * every placeholder already filled from live data. Rendering server-side keeps
 * customer data out of the client bundle and guarantees the message the
 * salesperson sees is the message that gets sent.
 */
export async function getLeadSendContext(leadId: string): Promise<SendContext | null> {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) return null;

  const lead = await db.lead.findFirst({
    where: {
      id: leadId,
      dealerId: user.dealerId,
      ...(can(user, PERMISSIONS.LEADS_VIEW_ALL) ? {} : { ownerId: user.id }),
    },
    include: {
      customer: true,
      vehicle: {
        select: {
          id: true, stockId: true, year: true, make: true, model: true,
          variant: true, sellingPrice: true,
        },
      },
      branch: true,
      testDrives: { orderBy: { scheduledAt: "desc" }, take: 1 },
      bookings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lead) return null;

  const dealer = await db.dealer.findUnique({
    where: { id: user.dealerId },
    select: { name: true, slug: true, addressLine: true, city: true, mapsUrl: true },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const vehicleLink = lead.vehicle
    ? `${origin}/d/${dealer?.slug}/cars/${slugFor(lead.vehicle)}`
    : "";

  const testDrive = lead.testDrives[0];
  const booking = lead.bookings[0];

  const vars: TemplateVars = {
    customer: lead.customer.name,
    customer_first: lead.customer.name.split(" ")[0],
    dealer: dealer?.name ?? "",
    salesperson: user.name,
    vehicle: lead.vehicle ? vehicleTitle(lead.vehicle) : "",
    stock_id: lead.vehicle?.stockId ?? "",
    price: lead.vehicle ? formatPrice(lead.vehicle.sellingPrice) : "",
    link: vehicleLink,
    branch: lead.branch?.name ?? "",
    branch_address:
      [lead.branch?.addressLine, lead.branch?.city].filter(Boolean).join(", ") ||
      [dealer?.addressLine, dealer?.city].filter(Boolean).join(", "),
    date: testDrive ? formatDate(testDrive.scheduledAt) : formatDate(new Date()),
    time: testDrive ? formatTime(testDrive.scheduledAt) : "",
    amount: booking ? formatPrice(booking.bookingAmount) : lead.vehicle ? formatPrice(lead.vehicle.sellingPrice) : "",
  };

  const templates = await getTemplates(user.dealerId);
  const usable = templates.filter((t) => {
    // Hide vehicle templates when no vehicle is attached — a message with a
    // blank car name is worse than no shortcut at all.
    if (t.category === "vehicle" && !lead.vehicle) return false;
    if (t.key === "test_drive" && !testDrive) return false;
    if (t.key === "booking" && !booking) return false;
    return true;
  });

  const rendered: Record<string, string> = {};
  for (const t of usable) {
    rendered[t.key] = renderTemplate(
      t.key === "location" ? t.body.replace("{{link}}", dealer?.mapsUrl ?? "") : t.body,
      vars,
    );
  }

  return {
    templates: usable.map((t) => ({
      id: t.id, key: t.key, name: t.name, category: t.category, body: t.body,
    })),
    rendered,
    phone: lead.customer.whatsapp ?? lead.customer.phone,
    customerName: lead.customer.name,
  };
}

function slugFor(v: { year: number; make: string; model: string; variant: string | null; stockId: string }) {
  const base = [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
  return `${base.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")}-${v.stockId.toLowerCase()}`;
}

/* ------------------------------ LOGGING ------------------------------- */

/**
 * Called the moment a salesperson opens WhatsApp or the dialler from the CRM.
 * This is what turns a click into a measurable touch on the lead timeline.
 */
export async function logOutreach(input: {
  leadId: string;
  channel: OutreachChannel;
  templateKey?: string;
  templateName?: string;
  preview?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const title =
    input.channel === "whatsapp"
      ? input.templateName
        ? `WhatsApp sent — ${input.templateName}`
        : "WhatsApp opened"
      : input.channel === "call"
        ? "Called the customer"
        : `${input.channel} sent`;

  const result = await recordOutreach({
    dealerId: user.dealerId,
    leadId: input.leadId,
    userId: user.id,
    channel: input.channel,
    title,
    body: input.preview?.slice(0, 600) ?? null,
    meta: input.templateKey ? { template: input.templateKey } : undefined,
  });

  if (input.templateKey) {
    await db.whatsappTemplate
      .updateMany({
        where: { dealerId: user.dealerId, key: input.templateKey },
        data: { useCount: { increment: 1 } },
      })
      .catch(() => null);
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/dashboard");
  return { status: "success" as const, firstResponse: result?.firstResponse ?? false };
}

/* ----------------------------- TEMPLATES ------------------------------ */

const templateSchema = z.object({
  name: z.string().trim().min(2, "Give the template a name"),
  category: z.enum(["lead", "vehicle", "booking", "general"]),
  body: z.string().trim().min(10, "The message is too short"),
  isActive: z.string().optional(),
});

export async function saveTemplate(templateId: string | null, formData: FormData) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { status: "error" as const, message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const d = parsed.data;

  if (templateId) {
    const existing = await db.whatsappTemplate.findFirst({
      where: { id: templateId, dealerId: user.dealerId },
    });
    if (!existing) return { status: "error" as const, message: "Template not found" };

    await db.whatsappTemplate.update({
      where: { id: templateId },
      data: {
        name: d.name,
        category: d.category,
        body: d.body,
        isActive: d.isActive === "on",
      },
    });
  } else {
    const key = `custom_${Date.now().toString(36)}`;
    const count = await db.whatsappTemplate.count({ where: { dealerId: user.dealerId } });
    await db.whatsappTemplate.create({
      data: {
        dealerId: user.dealerId,
        key,
        name: d.name,
        category: d.category,
        body: d.body,
        isActive: d.isActive === "on",
        sortOrder: count + 1,
      },
    });
  }

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: templateId ? "update" : "create",
    entity: "whatsapp_template",
    entityId: templateId,
    summary: `${templateId ? "Updated" : "Created"} WhatsApp template “${d.name}”`,
  });

  revalidatePath("/settings/templates");
  return { status: "success" as const, message: "Template saved" };
}

export async function resetTemplate(templateId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const template = await db.whatsappTemplate.findFirst({
    where: { id: templateId, dealerId: user.dealerId },
  });
  if (!template) return { status: "error" as const, message: "Template not found" };

  const original = DEFAULT_TEMPLATES.find((t) => t.key === template.key);
  if (!original) {
    return { status: "error" as const, message: "This is a custom template — there is nothing to reset to." };
  }

  await db.whatsappTemplate.update({
    where: { id: templateId },
    data: { body: original.body, name: original.name, category: original.category, isActive: true },
  });

  revalidatePath("/settings/templates");
  return { status: "success" as const, message: `${original.name} restored to the default wording` };
}

export async function deleteTemplate(templateId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const template = await db.whatsappTemplate.findFirst({
    where: { id: templateId, dealerId: user.dealerId },
  });
  if (!template) return { status: "error" as const, message: "Template not found" };
  if (template.isSystem) {
    return {
      status: "error" as const,
      message: "Built-in templates cannot be deleted. Turn it off instead, or reset the wording.",
    };
  }

  await db.whatsappTemplate.delete({ where: { id: templateId } });
  revalidatePath("/settings/templates");
  return { status: "success" as const, message: "Template deleted" };
}
