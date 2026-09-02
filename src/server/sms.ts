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
import { randomBytes } from "node:crypto";

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
  /** Where the gateway should POST delivery reports. Null until generated. */
  dlrUrl: string | null;
};

/** Safe to hand to a client component. */
export async function getSmsStatus(dealerId: string): Promise<SmsStatus> {
  const row = await db.smsSettings.findUnique({ where: { dealerId } });
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    dlrUrl: row?.dlrSecret ? `${base}/api/sms/dlr/${row.dlrSecret}` : null,
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
        // Dealers are billed per segment, so it is recorded per message rather
        // than recomputed later from text that may since have been edited.
        segments: body ? smsSegments(body).segments : 1,
        error: extra.error ?? null,
        providerId: extra.providerId ?? null,
        // The gateway accepting a message is not delivery; that arrives later
        // on the webhook, if the operator sends one at all.
        deliveryStatus: status === "sent" ? "queued" : null,
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

  // Checked here, not in the caller, so no future feature can send around it.
  const optedOut = await db.smsOptOut.findUnique({
    where: { dealerId_phone: { dealerId: input.dealerId, phone: to } },
  });
  if (optedOut) {
    const id = await log("skipped", input.body ?? "", {
      to,
      error: `Opted out${optedOut.reason ? `: ${optedOut.reason}` : ""}`,
    });
    return {
      status: "skipped",
      message: "That number has opted out of your messages.",
      logId: id,
    };
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

export type SmsLogFilter = {
  status?: string;
  delivery?: string;
  q?: string;
  customerId?: string;
};

function logWhere(dealerId: string, filter: SmsLogFilter) {
  return {
    dealerId,
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.delivery === "pending"
      ? { status: "sent", deliveryStatus: "queued" }
      : filter.delivery
        ? { deliveryStatus: filter.delivery }
        : {}),
    ...(filter.q
      ? {
          OR: [
            { toNumber: { contains: filter.q.replace(/\D/g, "") || filter.q } },
            { body: { contains: filter.q } },
            { templateKey: { contains: filter.q } },
          ],
        }
      : {}),
  };
}

export async function getSmsLogs(
  dealerId: string,
  opts: { take?: number; skip?: number; filter?: SmsLogFilter } = {},
) {
  const where = logWhere(dealerId, opts.filter ?? {});
  const [items, total] = await Promise.all([
    db.smsLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.skip ?? 0,
      take: opts.take ?? 25,
    }),
    db.smsLog.count({ where }),
  ]);
  return { items, total };
}

/**
 * What the dealer is actually being billed for.
 *
 * Segments, not messages: a single Unicode template can be five segments, and a
 * dealer comparing this against their gateway invoice needs the number the
 * gateway charges on.
 */
export async function getSmsUsage(dealerId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allTime, month, delivery, optOuts] = await Promise.all([
    db.smsLog.groupBy({
      by: ["status"],
      where: { dealerId },
      _count: { _all: true },
      _sum: { segments: true },
    }),
    db.smsLog.aggregate({
      where: { dealerId, status: "sent", createdAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { segments: true },
    }),
    db.smsLog.groupBy({
      by: ["deliveryStatus"],
      where: { dealerId, status: "sent" },
      _count: { _all: true },
    }),
    db.smsOptOut.count({ where: { dealerId } }),
  ]);

  const by = (s: string) => allTime.find((r) => r.status === s);
  const delivered = delivery.find((d) => d.deliveryStatus === "delivered")?._count._all ?? 0;
  const reported = delivery
    .filter((d) => d.deliveryStatus && d.deliveryStatus !== "queued")
    .reduce((n, d) => n + d._count._all, 0);

  return {
    sent: by("sent")?._count._all ?? 0,
    failed: by("failed")?._count._all ?? 0,
    skipped: by("skipped")?._count._all ?? 0,
    segmentsAllTime: by("sent")?._sum.segments ?? 0,
    monthMessages: month._count._all,
    monthSegments: month._sum.segments ?? 0,
    delivered,
    /** Reports actually received, so a delivery rate is never implied from none. */
    reported,
    awaitingReport: delivery.find((d) => d.deliveryStatus === "queued")?._count._all ?? 0,
    optOuts,
  };
}

export async function getOptOuts(dealerId: string, take = 50) {
  return db.smsOptOut.findMany({
    where: { dealerId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
