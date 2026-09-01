import Link from "next/link";
import { Gauge, ArrowRight } from "lucide-react";
import { Card, CardHeader, ProgressBar } from "@/components/ui/primitives";
import { waitLabel } from "@/lib/attention";
import type { OperationsMetrics } from "@/server/attention";
import { cn } from "@/lib/utils";

/**
 * How the operation is actually running.
 *
 * Four numbers a manager can act on, each paired with the thing to do about it.
 * No vanity metrics: nothing here is on the page unless a bad reading would
 * change what somebody does tomorrow.
 */
export function OperationsHealth({
  metrics,
  showBacklogLinks = true,
}: {
  metrics: OperationsMetrics;
  showBacklogLinks?: boolean;
}) {
  const {
    responseMedianMinutes,
    slaCompliancePct,
    slaTargetMinutes,
    followUpOnTimePct,
    followUpMedianLatenessMinutes,
    uncontactedNow,
    overdueFollowUpsNow,
    medianDaysToSell,
    answered,
    followUpsCompleted,
    soldCount,
    windowDays,
  } = metrics;

  const tone = (value: number | null, good: number, ok: number) =>
    value === null
      ? "neutral"
      : value >= good
        ? "success"
        : value >= ok
          ? "warning"
          : "danger";

  const TONE_TEXT = {
    success: "text-success-700",
    warning: "text-warning-700",
    danger: "text-danger-700",
    neutral: "text-ink-400",
  } as const;

  const slaTone = tone(slaCompliancePct, 80, 50);
  const followUpTone = tone(followUpOnTimePct, 80, 50);

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="How the operation is running"
          description={`Last ${windowDays} days, measured against your own thresholds`}
          icon={<Gauge className="size-4" />}
        />
      </div>

      <div className="grid gap-px border-t border-ink-100 bg-ink-100 sm:grid-cols-2">
        {/* Response speed */}
        <div className="bg-white p-4 sm:p-5">
          <p className="field-label">Median first reply</p>
          <p className="mt-1 font-display text-[24px] leading-none font-semibold text-ink-950">
            {responseMedianMinutes === null ? "—" : waitLabel(responseMedianMinutes)}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-500">
            {answered
              ? `Across ${answered} answered ${answered === 1 ? "enquiry" : "enquiries"}. Half were faster than this.`
              : "No enquiries answered in this window yet."}
          </p>
        </div>

        {/* SLA compliance */}
        <div className="bg-white p-4 sm:p-5">
          <p className="field-label">Answered within {slaTargetMinutes} minutes</p>
          <p
            className={cn(
              "mt-1 font-display text-[24px] leading-none font-semibold",
              TONE_TEXT[slaTone],
            )}
          >
            {slaCompliancePct === null ? "—" : `${slaCompliancePct}%`}
          </p>
          {slaCompliancePct !== null && (
            <div className="mt-2.5">
              <ProgressBar value={slaCompliancePct} tone={slaTone === "neutral" ? "brand" : slaTone} />
            </div>
          )}
          <p className="mt-1.5 text-[12px] text-ink-500">
            Your promise is set in{" "}
            <Link href="/settings/thresholds" className="font-medium text-brand-700 hover:underline">
              thresholds
            </Link>
            .
          </p>
        </div>

        {/* Follow-up discipline */}
        <div className="bg-white p-4 sm:p-5">
          <p className="field-label">Follow-ups done on time</p>
          <p
            className={cn(
              "mt-1 font-display text-[24px] leading-none font-semibold",
              TONE_TEXT[followUpTone],
            )}
          >
            {followUpOnTimePct === null ? "—" : `${followUpOnTimePct}%`}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-500">
            {followUpsCompleted
              ? followUpMedianLatenessMinutes !== null
                ? `${followUpsCompleted} completed. The late ones ran ${waitLabel(followUpMedianLatenessMinutes)} over.`
                : `All ${followUpsCompleted} were completed on time.`
              : "No follow-ups completed in this window."}
          </p>
        </div>

        {/* How long stock takes to move */}
        <div className="bg-white p-4 sm:p-5">
          <p className="field-label">Median days to sell</p>
          <p className="mt-1 font-display text-[24px] leading-none font-semibold text-ink-950">
            {medianDaysToSell === null ? "—" : medianDaysToSell}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-500">
            {soldCount
              ? `${soldCount} sold. Half moved faster than this.`
              : "Nothing sold in this window."}
          </p>
        </div>
      </div>

      {/* What is sitting undone right now */}
      {showBacklogLinks && (uncontactedNow > 0 || overdueFollowUpsNow > 0) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
            Right now
          </span>
          {uncontactedNow > 0 && (
            <Link
              href="/leads?bucket=uncontacted"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-danger-700 hover:text-danger-800"
            >
              {uncontactedNow} unanswered {uncontactedNow === 1 ? "enquiry" : "enquiries"}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
          {overdueFollowUpsNow > 0 && (
            <Link
              href="/attention/day?queue=followups"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-danger-700 hover:text-danger-800"
            >
              {overdueFollowUpsNow} overdue follow-{overdueFollowUpsNow === 1 ? "up" : "ups"}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
