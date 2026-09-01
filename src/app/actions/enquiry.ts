"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { captureEnquiry } from "@/server/leads";
import { normalisePhone } from "@/lib/utils";

const enquirySchema = z.object({
  dealerSlug: z.string().min(1),
  name: z.string().trim().min(2, "Please enter your name"),
  phone: z
    .string()
    .trim()
    .refine((v) => normalisePhone(v).length === 10, "Enter a valid 10-digit mobile number"),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  city: z.string().trim().optional(),
  message: z.string().trim().max(1000).optional(),
  vehicleId: z.string().optional(),
  branchId: z.string().optional(),
  source: z.string().optional(),
  requirement: z.string().trim().optional(),
  testDriveAt: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  pageUrl: z.string().optional(),
  /** Honeypot — real people never fill this. */
  website: z.string().optional(),
});

export type EnquiryState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitEnquiry(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = enquirySchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;

  // Silently accept and discard bot submissions.
  if (data.website) return { status: "success", message: "Thank you. We will call you shortly." };

  const dealer = await db.dealer.findUnique({
    where: { slug: data.dealerSlug },
    select: { id: true, status: true, name: true },
  });
  if (!dealer || dealer.status === "suspended" || dealer.status === "expired") {
    return { status: "error", message: "This showroom is not accepting enquiries right now." };
  }

  const referer = (await headers()).get("referer");

  try {
    const result = await captureEnquiry({
      dealerId: dealer.id,
      name: data.name,
      phone: data.phone,
      whatsapp: data.whatsapp || data.phone,
      email: data.email || null,
      city: data.city || null,
      message: data.message || null,
      requirement: data.requirement || null,
      vehicleId: data.vehicleId || null,
      branchId: data.branchId || null,
      source: data.source || "website",
      pageUrl: data.pageUrl || referer,
      utm: {
        source: data.utmSource || null,
        medium: data.utmMedium || null,
        campaign: data.utmCampaign || null,
      },
      testDriveAt: data.testDriveAt ? new Date(data.testDriveAt) : null,
    });

    revalidatePath("/leads");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: result.isDuplicate
        ? `Thanks ${result.customer.name.split(" ")[0]} — we already have your enquiry and our team will call you shortly.`
        : `Thanks ${result.customer.name.split(" ")[0]}! Your enquiry is with our team at ${dealer.name}. Expect a call shortly.`,
    };
  } catch {
    return { status: "error", message: "Something went wrong. Please call us instead." };
  }
}

/** Records a WhatsApp CTA click as lead activity so the source is measurable. */
export async function trackWhatsAppClick(dealerSlug: string, vehicleId?: string) {
  const dealer = await db.dealer.findUnique({ where: { slug: dealerSlug }, select: { id: true } });
  if (!dealer) return;

  if (vehicleId) {
    await db.vehicle.updateMany({
      where: { id: vehicleId, dealerId: dealer.id },
      data: { enquiryCount: { increment: 1 } },
    });
  }

  const vehicle = vehicleId
    ? await db.vehicle.findFirst({
        where: { id: vehicleId, dealerId: dealer.id },
        select: { stockId: true, make: true, model: true, year: true },
      })
    : null;

  await db.notification.create({
    data: {
      dealerId: dealer.id,
      type: "lead.new",
      title: "WhatsApp enquiry started",
      body: vehicle
        ? `A visitor opened WhatsApp for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stockId})`
        : "A visitor opened WhatsApp from your website",
      link: vehicleId ? `/inventory/${vehicleId}` : "/leads",
    },
  });
}

/** Increments the public view counter — used for the popular-cars report. */
export async function trackVehicleView(vehicleId: string) {
  await db.vehicle.update({
    where: { id: vehicleId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => null);
}
