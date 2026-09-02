"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/server/events";
import { sendDealerSms, getSmsStatus } from "@/server/sms";
import { smsPlaceholders, toSmsNumber } from "@/lib/sms";
import { randomBytes } from "node:crypto";

/**
 * SMS configuration and sending.
 *
 * The gateway password is write-only from the UI's point of view: a blank field
 * means "leave what is stored alone", so a dealer can edit the sender ID without
 * the password ever being sent to the browser and posted back.
 */

export type SmsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveSmsSettings(
  _prev: SmsActionState,
  formData: FormData,
): Promise<SmsActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const username = get("username");
  const senderId = get("senderId");
  const password = get("password");
  const ivrNumber = get("ivrNumber");
  const isActive = formData.get("isActive") === "on";

  // DLT sender IDs are exactly six alphanumeric characters.
  if (senderId && !/^[A-Za-z0-9]{6}$/.test(senderId)) {
    return {
      status: "error",
      message: "A DLT sender ID is exactly six letters or digits, like BRKLEY.",
      fieldErrors: { senderId: "Must be 6 characters" },
    };
  }

  const existing = await db.smsSettings.findUnique({
    where: { dealerId: user.dealerId },
    select: { password: true },
  });

  if (isActive && !username) {
    return {
      status: "error",
      message: "Add the gateway username before switching sending on.",
      fieldErrors: { username: "Required" },
    };
  }
  if (isActive && !password && !existing?.password) {
    return {
      status: "error",
      message: "Add the gateway password before switching sending on.",
      fieldErrors: { password: "Required" },
    };
  }
  if (isActive && !senderId) {
    return {
      status: "error",
      message: "Add your approved sender ID before switching sending on.",
      fieldErrors: { senderId: "Required" },
    };
  }

  const data = {
    provider: "smartping",
    username,
    senderId: senderId ? senderId.toUpperCase() : null,
    ivrNumber,
    isActive,
    // A blank password field leaves the stored one untouched.
    ...(password ? { password } : {}),
  };

  await db.smsSettings.upsert({
    where: { dealerId: user.dealerId },
    create: { dealerId: user.dealerId, ...data, password: password ?? null },
    update: data,
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "dealer",
    entityId: user.dealerId,
    // Deliberately records that a credential changed, never the credential.
    summary: `Updated SMS settings (sending ${isActive ? "on" : "off"}${password ? ", password changed" : ""})`,
  });

  revalidatePath("/settings/sms");
  return { status: "success", message: "SMS settings saved" };
}

/* ------------------------------ TEMPLATES ----------------------------- */

export async function saveSmsTemplate(input: {
  id?: string;
  key: string;
  name: string;
  body: string;
  dltTemplateId?: string | null;
  isActive?: boolean;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!key) return { status: "error" as const, message: "Give the template a key." };
  if (!input.body.trim()) return { status: "error" as const, message: "The message is empty." };

  const data = {
    name: input.name.trim() || key,
    body: input.body.trim(),
    dltTemplateId: input.dltTemplateId?.trim() || null,
    isActive: input.isActive ?? true,
  };

  await db.smsTemplate.upsert({
    where: { dealerId_key: { dealerId: user.dealerId, key } },
    create: { dealerId: user.dealerId, key, ...data },
    update: data,
  });

  revalidatePath("/settings/sms");
  return {
    status: "success" as const,
    message: "Template saved",
    placeholders: smsPlaceholders(data.body),
  };
}

export async function deleteSmsTemplate(id: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);
  await db.smsTemplate.deleteMany({ where: { id, dealerId: user.dealerId } });
  revalidatePath("/settings/sms");
  return { status: "success" as const, message: "Template deleted" };
}

/* -------------------------------- SEND -------------------------------- */

/**
 * Sends a test to the signed-in user's own mobile.
 *
 * Deliberately restricted to their own number: a "test" box that accepts any
 * number is a way to message strangers from someone else's approved sender ID.
 */
export async function sendTestSms(templateKey: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { phone: true, whatsapp: true, name: true },
  });
  const phone = me?.phone ?? me?.whatsapp;
  if (!phone) {
    return {
      status: "error" as const,
      message: "Add a mobile number to your own staff profile first — tests only go to you.",
    };
  }

  const dealer = await db.dealer.findUnique({
    where: { id: user.dealerId },
    select: { name: true },
  });

  const result = await sendDealerSms({
    dealerId: user.dealerId,
    userId: user.id,
    phone,
    templateKey,
    ignoreActiveFlag: true,
    context: {
      customerName: me?.name,
      extra: { var: dealer?.name ?? "" },
    },
  });

  revalidatePath("/settings/sms");
  return {
    status: result.status === "sent" ? ("success" as const) : ("error" as const),
    message: result.message,
    text: result.text,
  };
}

/** Sends a template to one customer, from the customer or lead screen. */
export async function sendCustomerSms(input: {
  customerId: string;
  templateKey: string;
  leadId?: string;
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.LEADS_MANAGE);

  const customer = await db.customer.findFirst({
    where: { id: input.customerId, dealerId: user.dealerId },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) return { status: "error" as const, message: "Customer not found" };

  const dealer = await db.dealer.findUnique({
    where: { id: user.dealerId },
    select: { name: true },
  });

  const result = await sendDealerSms({
    dealerId: user.dealerId,
    userId: user.id,
    phone: customer.phone,
    templateKey: input.templateKey,
    customerId: customer.id,
    leadId: input.leadId ?? null,
    context: { customerName: customer.name, extra: { var: dealer?.name ?? "" } },
  });

  if (result.status === "sent" && input.leadId) {
    await db.leadActivity.create({
      data: {
        dealerId: user.dealerId,
        leadId: input.leadId,
        userId: user.id,
        type: "note",
        title: "SMS sent",
        body: result.text ?? null,
      },
    });
    revalidatePath(`/leads/${input.leadId}`);
  }

  revalidatePath(`/customers/${customer.id}`);
  return {
    status: result.status === "sent" ? ("success" as const) : ("error" as const),
    message: result.message,
  };
}

export async function currentSmsStatus() {
  const user = await requireDealerUser();
  return getSmsStatus(user.dealerId);
}

/* ------------------------------ OPT-OUTS ------------------------------ */

/**
 * Adds a number to the do-not-message register.
 *
 * TRAI puts the obligation on the sender, and the penalty falls on the
 * dealership's own DLT registration, so this is enforced inside the send path
 * rather than left to whoever writes the next feature.
 */
export async function addSmsOptOut(input: { phone: string; reason?: string }) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const phone = toSmsNumber(input.phone);
  if (!phone) {
    return { status: "error" as const, message: "That is not a valid Indian mobile number." };
  }

  await db.smsOptOut.upsert({
    where: { dealerId_phone: { dealerId: user.dealerId, phone } },
    create: {
      dealerId: user.dealerId,
      phone,
      source: "manual",
      reason: input.reason?.trim() || null,
      createdById: user.id,
    },
    update: { reason: input.reason?.trim() || null },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "sms",
    summary: `Added ${phone} to the do-not-message list`,
  });

  revalidatePath("/settings/sms");
  return { status: "success" as const, message: "Added. They will not be messaged again." };
}

export async function removeSmsOptOut(id: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const row = await db.smsOptOut.findFirst({
    where: { id, dealerId: user.dealerId },
    select: { phone: true },
  });
  if (!row) return { status: "error" as const, message: "Not found" };

  await db.smsOptOut.deleteMany({ where: { id, dealerId: user.dealerId } });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "delete",
    entity: "sms",
    summary: `Removed ${row.phone} from the do-not-message list`,
  });

  revalidatePath("/settings/sms");
  return { status: "success" as const, message: "Removed" };
}

/* --------------------------- DELIVERY REPORTS ------------------------- */

/**
 * Creates the webhook secret, so the gateway can report delivery.
 *
 * Regenerating invalidates the old URL immediately, which is the point when a
 * secret has been shared by mistake.
 */
export async function rotateDlrSecret() {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const secret = randomBytes(24).toString("base64url");

  await db.smsSettings.upsert({
    where: { dealerId: user.dealerId },
    create: { dealerId: user.dealerId, dlrSecret: secret },
    update: { dlrSecret: secret },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "sms",
    // Records that it changed, never the value.
    summary: "Regenerated the SMS delivery-report URL",
  });

  revalidatePath("/settings/sms");
  return { status: "success" as const, message: "New delivery-report URL generated" };
}

/** Sends a template to one customer, chosen from this dealership's own list. */
export async function sendSmsToCustomer(input: { customerId: string; templateKey: string }) {
  return sendCustomerSms({ customerId: input.customerId, templateKey: input.templateKey });
}
