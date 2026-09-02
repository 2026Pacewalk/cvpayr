import "server-only";
import { db } from "@/lib/db";
import { sendSms, smsConfigured, type SmsCredentials } from "@/lib/channels";
import {
  renderSms,
  toSmsNumber,
  smsSegments,
  isGsm7,
  DEFAULT_SMS_TEMPLATES,
  type SmsContext,
} from "@/lib/sms";

/**
 * Sending SMS on a dealership's behalf.
 *
 * Two rules run through everything here:
 *
 *   The password never leaves the server. `getSmsSettings` is the only function
 *   that reads it, and it is never returned to a client component — the
 *   settings screen is told whether a password exists, not what it is.
 *
 *   Nothing is recorded as sent unless the gateway accepted it. Every attempt
 *   writes an SmsLog row, and a refusal is stored with the gateway's own words
 *   rather than being swallowed.
 */

export type SmsStatus = {
  configured: boolean;
  active: boolean;
  provider: string;
  username: string | null;
  senderId: string | null;
  ivrNumber: string | null;
  /** Whether a password is stored — never the password itself. */
  hasPassword: boolean;
};

/** Safe to hand to a client component. */
export async function getSmsStatus(dealerId: string): Promise<SmsStatus> {
  const row = await db.smsSettings.findUnique({ where: { dealerId } });
  return {
    configured: smsConfigured({
      username: row?.username ?? undefined,
      password: row?.password ?? undefined,
      senderId: row?.senderId ?? undefined,
    }),
    active: row?.isActive ?? false,
    provider: row?.provider ?? "smartping",
    username: row?.username ?? null,
    senderId: row?.senderId ?? null,
    ivrNumber: row?.ivrNumber ?? null,
    hasPassword: Boolean(row?.password),
  };
}

/** Server-only. Includes the password, so never return this to the client. */
async function getCredentials(
  dealerId: string,
): Promise<{ creds: SmsCredentials; ivrNumber: string | null; active: boolean } | null> {
  const row = await db.smsSettings.findUnique({ where: { dealerId } });
  if (!row?.username || !row.password || !row.senderId) return null;
  return {
    creds: {
      provider: row.provider,
      username: row.username,
      password: row.password,
      senderId: row.senderId,
    },
    ivrNumber: row.ivrNumber,
    active: row.isActive,
  };
}

/* ------------------------------ TEMPLATES ----------------------------- */

/** Lazily seeds the starter templates the first time a dealer opens the screen. */
export async function getSmsTemplates(dealerId: string, opts?: { includeInactive?: boolean }) {
  const existing = await db.smsTemplate.findMany({
    where: { dealerId, ...(opts?.includeInactive ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  });
  if (existing.length) return existing;

  const anyAtAll = await db.smsTemplate.count({ where: { dealerId } });
  if (anyAtAll > 0) return existing;

  await db.smsTemplate.createMany({
    data: DEFAULT_SMS_TEMPLATES.map((t) => ({ ...t, dealerId })),
  });
  return db.smsTemplate.findMany({ where: { dealerId }, orderBy: { createdAt: "asc" } });
}

/* -------------------------------- SEND -------------------------------- */

export type SendSmsInput = {
  dealerId: string;
  userId?: string | null;
  /** Raw phone as stored on the customer; normalised here. */
  phone: string | null | undefined;
  /** Either a template key, or a literal body. */
  templateKey?: string;
  body?: string;
  context?: SmsContext;
  customerId?: string | null;
  leadId?: string | null;
  /** Skip the "is sending switched on" check, for the settings screen test. */
  ignoreActiveFlag?: boolean;
};

export type SendSmsResult = {
  status: "sent" | "failed" | "skipped";
  message: string;
  /** The exact text that was submitted, so the UI can show what went out. */
  text?: string;
  logId?: string;
};

/**
 * Sends one message and records the attempt.
 *
 * Refuses rather than guessing when a DLT placeholder cannot be filled: an
 * operator drops a message whose text no longer matches the registered
 * template, so sending "call our IVR Number {#cbn#}" would cost money and
 * deliver nothing.
 */
export async function sendDealerSms(input: SendSmsInput): Promise<SendSmsResult> {
  const config = await getCredentials(input.dealerId);

  const log = async (
    status: "sent" | "failed" | "skipped",
    body: string,
    extra: { error?: string; providerId?: string; to?: string } = {},
  ) => {
    const row = await db.smsLog.create({
      data: {
        dealerId: input.dealerId,
        userId: input.userId ?? null,
        toNumber: extra.to ?? String(input.phone ?? ""),
        templateKey: input.templateKey ?? null,
        body,
        status,
        error: extra.error ?? null,
        providerId: extra.providerId ?? null,
        customerId: input.customerId ?? null,
        leadId: input.leadId ?? null,
      },
    });
    return row.id;
  };

  if (!config) {
    return {
      status: "skipped",
      message: "SMS is not configured for this dealership yet.",
    };
  }
  if (!config.active && !input.ignoreActiveFlag) {
    return { status: "skipped", message: "SMS sending is switched off." };
  }

  const to = toSmsNumber(input.phone);
  if (!to) {
    const id = await log("failed", input.body ?? "", { error: "Not a valid Indian mobile number" });
    return { status: "failed", message: "That is not a valid Indian mobile number.", logId: id };
  }

  // Resolve the body, from a template or from the literal text given.
  let body = input.body ?? "";
  if (input.templateKey) {
    const template = await db.smsTemplate.findUnique({
      where: { dealerId_key: { dealerId: input.dealerId, key: input.templateKey } },
    });
    if (!template || !template.isActive) {
      return { status: "skipped", message: "That template is missing or switched off." };
    }
    body = template.body;
  }
  if (!body.trim()) return { status: "skipped", message: "Nothing to send." };

  const { text, unresolved } = renderSms(body, {
    ivrNumber: input.context?.ivrNumber ?? config.ivrNumber,
    customerName: input.context?.customerName,
    extra: input.context?.extra,
  });

  if (unresolved.length) {
    const id = await log("failed", text, {
      to,
      error: `Unfilled placeholder(s): ${unresolved.map((u) => `{#${u}#}`).join(", ")}`,
    });
    return {
      status: "failed",
      message: `Cannot send — ${unresolved
        .map((u) => `{#${u}#}`)
        .join(", ")} has no value. The operator rejects a template that does not match exactly.`,
      logId: id,
    };
  }

  const result = await sendSms(config.creds, {
    to,
    text,
    unicode: !isGsm7(text),
  });

  if (!result.sent) {
    const id = await log("failed", text, {
      to,
      error: result.reason === "provider_error" ? (result.detail ?? "Gateway error") : result.reason,
    });
    return {
      status: "failed",
      message:
        result.reason === "not_configured"
          ? "SMS credentials are incomplete."
          : result.reason === "invalid_recipient"
            ? "The gateway rejected that number."
            : `The gateway refused it: ${result.detail ?? "no reason given"}`,
      text,
      logId: id,
    };
  }

  const id = await log("sent", text, { to, providerId: result.id });
  if (input.templateKey) {
    await db.smsTemplate.updateMany({
      where: { dealerId: input.dealerId, key: input.templateKey },
      data: { useCount: { increment: 1 } },
    });
  }

  const seg = smsSegments(text);
  return {
    status: "sent",
    message: `Sent · ${seg.segments} segment${seg.segments === 1 ? "" : "s"} (${seg.encoding})`,
    text,
    logId: id,
  };
}

/* -------------------------------- HISTORY ------------------------------ */

export async function getSmsLogs(
  dealerId: string,
  opts: { take?: number; customerId?: string } = {},
) {
  return db.smsLog.findMany({
    where: { dealerId, ...(opts.customerId ? { customerId: opts.customerId } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function getSmsCounts(dealerId: string) {
  const [sent, failed] = await Promise.all([
    db.smsLog.count({ where: { dealerId, status: "sent" } }),
    db.smsLog.count({ where: { dealerId, status: "failed" } }),
  ]);
  return { sent, failed };
}
