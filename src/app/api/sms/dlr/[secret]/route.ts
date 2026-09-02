import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Delivery reports from the SMS gateway.
 *
 * The gateway accepting a message is not the same thing as a handset receiving
 * it. Without this, "sent" in the log means "SmartPing took it", which is
 * misleading to a dealer wondering why a customer never replied.
 *
 * The URL carries a per-dealer secret, so a caller who guessed a dealer id
 * cannot mark another dealership's messages delivered. The secret identifies
 * the tenant; nothing in the payload is trusted for that.
 *
 * Gateways vary, so both GET (query string) and POST (form or JSON) are
 * accepted, and the common field spellings are all recognised.
 */

/** Maps a gateway's own vocabulary onto ours. */
function normaliseStatus(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/deliv|dlvrd|success|^0$/.test(s)) return "delivered";
  if (/expire/.test(s)) return "expired";
  if (/reject|blocked|dnd|spam/.test(s)) return "rejected";
  if (/undeliv|fail|error|absent|invalid/.test(s)) return "undelivered";
  if (/queue|pending|submit|accept|sent/.test(s)) return "queued";
  return s.slice(0, 40);
}

function pick(source: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const found = Object.keys(source).find((x) => x.toLowerCase() === k);
    if (found && source[found]) return source[found];
  }
  return null;
}

async function handle(request: Request, secret: string) {
  const settings = await db.smsSettings.findUnique({
    where: { dlrSecret: secret },
    select: { dealerId: true },
  });
  // Same answer whether the secret is wrong or simply unknown, so this cannot
  // be used to discover which secrets exist.
  if (!settings) return NextResponse.json({ error: "unknown" }, { status: 404 });

  const url = new URL(request.url);
  const fields: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (fields[k] = v));

  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    try {
      if (type.includes("json")) {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) fields[k] = String(v);
      } else {
        const form = await request.formData();
        form.forEach((v, k) => (fields[k] = String(v)));
      }
    } catch {
      // A malformed body still leaves the query string usable.
    }
  }

  const providerId = pick(fields, ["messageid", "msgid", "id", "requestid", "smsid"]);
  const status = normaliseStatus(pick(fields, ["status", "dlrstatus", "state", "deliverystatus"]));
  const failureCode = pick(fields, ["errorcode", "err", "reason", "failurecode"]);

  if (!providerId || !status) {
    return NextResponse.json(
      { error: "message id and status are required", received: Object.keys(fields) },
      { status: 400 },
    );
  }

  // Scoped by dealer as well as message id: a report can only ever update the
  // messages belonging to the dealership whose secret was used.
  const result = await db.smsLog.updateMany({
    where: { dealerId: settings.dealerId, providerId },
    data: {
      deliveryStatus: status,
      deliveredAt: status === "delivered" ? new Date() : null,
      failureCode: failureCode ?? null,
    },
  });

  // 200 even when nothing matched: gateways retry on an error status, and a
  // report for a message we never stored is not worth a retry storm.
  return NextResponse.json({ ok: true, matched: result.count, status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  return handle(request, secret);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  return handle(request, secret);
}
