import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPreference, inboxWhere, unreadCount } from "@/server/notifications";
import { maybeSweep } from "@/server/reminders";
import { db } from "@/lib/db";
import { typeMeta } from "@/lib/notifications";
import { safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Polling endpoint for the notification bell.
 *
 * Returns the unread count plus anything created after `since`, so a client can
 * show a toast, ring, or raise a browser notification for genuinely new items
 * without re-announcing what it has already seen.
 *
 * The scope is derived entirely from the session — dealer, user and branch —
 * so a caller cannot ask for another dealer's inbox by changing a parameter.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.dealerId) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const scope = {
    dealerId: session.dealerId,
    userId: session.id,
    branchIds: session.branchIds,
  };

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  // Keeps scheduled reminders firing on deployments without a cron scheduler.
  // Does real work at most once every ten minutes; everything it writes is
  // deduplicated exactly like a cron-driven run.
  void maybeSweep();

  const [unread, fresh, pref] = await Promise.all([
    unreadCount(scope),
    db.notification.findMany({
      where: {
        ...inboxWhere(scope),
        isRead: false,
        ...(validSince ? { createdAt: { gt: validSince } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: validSince ? 10 : 8,
    }),
    getPreference(session.id),
  ]);

  return NextResponse.json(
    {
      unread,
      now: new Date().toISOString(),
      sound: pref.sound,
      browserPush: pref.browserPush,
      items: fresh.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        priority: n.priority,
        category: n.category,
        icon: typeMeta(n.type).icon,
        createdAt: n.createdAt.toISOString(),
        meta: safeJsonParse<Record<string, unknown>>(n.meta, {}),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
