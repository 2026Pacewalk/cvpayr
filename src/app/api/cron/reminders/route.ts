import { NextResponse } from "next/server";
import { runReminderSweep, REMINDER_JOBS, type ReminderJob } from "@/server/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduled reminder trigger.
 *
 * Point any scheduler at this route every ten minutes:
 *
 *   curl -X POST https://your-domain/api/cron/reminders \
 *        -H "x-cron-secret: $CRON_SECRET"
 *
 * Vercel Cron, a Linux crontab, GitHub Actions or an uptime pinger all work.
 * Because it runs on the server it keeps firing when nobody has the CRM open,
 * and every notification it writes is deduplicated, so overlapping runs are safe.
 */

function authorised(request: Request) {
  const expected = process.env.CRON_SECRET;

  // Without a configured secret the endpoint is refused in production rather
  // than left open — a reminder trigger anyone can call is a denial-of-service.
  if (!expected) return process.env.NODE_ENV !== "production";

  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  return header === expected || bearer === `Bearer ${expected}`;
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("jobs");
  const jobs = requested
    ? (requested.split(",").filter((j) => (REMINDER_JOBS as readonly string[]).includes(j)) as ReminderJob[])
    : undefined;
  const dealerId = url.searchParams.get("dealerId") ?? undefined;

  // Outside production, `at` lets you run the morning-only jobs (ageing,
  // document expiry, bookings, the daily plan) without waiting until 9am.
  // Ignored in production so a scheduler can never be tricked into replaying
  // an old timestamp.
  let now: Date | undefined;
  if (process.env.NODE_ENV !== "production") {
    const at = url.searchParams.get("at");
    if (at) {
      const parsed = new Date(at);
      if (!Number.isNaN(parsed.getTime())) now = parsed;
    }
  }

  const report = await runReminderSweep({
    jobs: jobs?.length ? jobs : undefined,
    dealerId,
    now,
  });

  const created = report.jobs.reduce((sum, j) => sum + j.created, 0);
  const errors = report.jobs.filter((j) => j.error);

  return NextResponse.json(
    { ok: errors.length === 0, created, ...report },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  return handle(request);
}

/** GET is allowed too, because most cron services can only issue GET. */
export async function GET(request: Request) {
  return handle(request);
}
