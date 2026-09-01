import Link from "next/link";
import { CheckCircle2, Zap, ArrowRight } from "lucide-react";
import { AttentionCard } from "./AttentionCard";
import { LinkButton } from "@/components/ui/Button";
import { ACTION_PRIORITY_META } from "@/lib/attention";
import type { AttentionResult } from "@/lib/attention";
import { cn } from "@/lib/utils";

/**
 * "Needs your attention".
 *
 * Deliberately shows nothing when there is nothing to do. A permanent row of
 * zeroes teaches people to ignore the section; an empty state that only appears
 * when the work is genuinely finished is worth reading.
 */
export function AttentionCentre({
  result,
  limit,
  showAllHref = "/attention",
  title = "Needs your attention",
  firstName,
  canAssign,
}: {
  result: AttentionResult;
  /** Cap for the dashboard. The full page passes nothing. */
  limit?: number;
  showAllHref?: string;
  title?: string;
  firstName?: string;
  canAssign?: boolean;
}) {
  const items = limit ? result.items.slice(0, limit) : result.items;
  const hidden = result.items.length - items.length;
  const { counts } = result;

  if (!result.items.length) {
    return (
      <section className="mb-5 rounded-[14px] border border-success-200 bg-success-50/50 px-5 py-6 text-center">
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-white text-success-600 ring-1 ring-success-100 ring-inset">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="font-display text-[16px] font-semibold text-ink-950">All caught up</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-600">
          Nothing needs {firstName ? "you" : "your attention"} right now. Every lead has been
          answered, every follow-up is on schedule and no booking is at risk.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] leading-tight font-semibold text-ink-950">
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {(["critical", "high", "medium"] as const).map((p) =>
              counts[p] > 0 ? (
                <span key={p} className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                  <span className={cn("size-1.5 rounded-full", ACTION_PRIORITY_META[p].dot)} />
                  {counts[p]} {ACTION_PRIORITY_META[p].label.toLowerCase()}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LinkButton href="/attention/day" size="sm">
            <Zap className="size-4" />
            Start my day
          </LinkButton>
          {limit && (
            <Link
              href={showAllHref}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-900"
            >
              {hidden > 0 ? `${hidden} more` : "See all"}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <AttentionCard
            key={item.id}
            item={item}
            compact={Boolean(limit)}
            canAssign={canAssign}
          />
        ))}
      </div>
    </section>
  );
}
