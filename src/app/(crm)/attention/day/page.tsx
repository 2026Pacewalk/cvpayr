import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { attentionScope, getDayQueue } from "@/server/attention";
import { DayQueue } from "@/components/crm/DayQueue";

export const metadata: Metadata = { title: "Start my day" };
export const dynamic = "force-dynamic";

/**
 * The guided work queue.
 *
 * `?queue=followups` narrows it to overdue and due follow-ups, which is what
 * "Start follow-ups" on the overdue card links to. Everything else builds the
 * full prioritised day: unanswered enquiries, imminent test drives, overdue
 * follow-ups, then what is merely scheduled.
 */
export default async function StartMyDayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_MANAGE)) redirect("/attention");

  const sp = await searchParams;
  const onlyFollowUps = sp.queue === "followups";

  const tasks = await getDayQueue(attentionScope(user, sp.branch ?? null), {
    only: onlyFollowUps ? "followups" : "all",
  });

  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/attention"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to the action centre
      </Link>

      <div className="mb-5">
        <h1 className="font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
          {onlyFollowUps ? "Follow-ups" : `Your day, ${firstName}`}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-500">
          {tasks.length
            ? onlyFollowUps
              ? "Worked in order, most overdue first. One customer at a time."
              : "In the order that matters. Call, say what happened, and the next one opens on its own."
            : "Nothing is waiting on you."}
        </p>
      </div>

      <DayQueue
        tasks={tasks}
        queueLabel={onlyFollowUps ? "Follow-up queue" : "Today's queue"}
      />
    </div>
  );
}
