import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Radio } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPreference } from "@/server/notifications";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui/primitives";
import { NotificationPreferences } from "@/components/crm/NotificationPreferences";
import { emailConfigured, whatsappApiConfigured } from "@/lib/channels";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await requireDealerUser();

  const [pref, row, lastRun] = await Promise.all([
    getPreference(user.id),
    db.notificationPreference.findUnique({
      where: { userId: user.id },
      select: { digestEnabled: true, digestHour: true },
    }),
    db.reminderRun.findFirst({
      where: { dealerId: user.dealerId, finishedAt: { not: null }, error: null },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, job: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>

      <PageHeader
        title="Notifications"
        description="Yours alone — changing these does not affect anyone else on the team."
      />

      <Card className="mb-5">
        <CardHeader
          title="Reminder engine"
          description="Scheduled reminders run on the server, so they keep firing when nobody has the CRM open."
          icon={<Radio className="size-4" />}
          action={
            lastRun ? (
              <Badge tone="success" dot>Running</Badge>
            ) : (
              <Badge tone="warning" dot>Not yet run</Badge>
            )
          }
        />
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">
          {lastRun
            ? `Last sweep ${relativeTime(lastRun.startedAt)}. Follow-ups, response times, ageing stock, expiring documents and bookings are all checked automatically.`
            : "No sweep has completed yet. It runs on its own within a few minutes of the CRM being used, or on the schedule your administrator configured."}
        </p>
      </Card>

      <NotificationPreferences
        values={{
          browserPush: pref.browserPush,
          email: pref.email,
          whatsapp: pref.whatsapp,
          sound: pref.sound,
          digestEnabled: row?.digestEnabled ?? true,
          digestHour: row?.digestHour ?? 9,
          quietStart: pref.quietStart ?? null,
          quietEnd: pref.quietEnd ?? null,
          mutedTypes: pref.mutedTypes,
          minPriority: pref.minPriority,
        }}
        emailConfigured={emailConfigured()}
        whatsappConfigured={whatsappApiConfigured()}
      />
    </div>
  );
}
