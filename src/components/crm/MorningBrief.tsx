"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sunrise, Zap, X, ArrowRight } from "lucide-react";
import { dismissBrief } from "@/app/actions/attention";
import { ACTION_PRIORITY_META, type BriefLine } from "@/lib/attention";
import { cn } from "@/lib/utils";

/**
 * The day's brief.
 *
 * Shown once per person per day: dismissing it records the date, so refreshing
 * the dashboard does not bring it back. It is a summary and a starting point,
 * not a second copy of the action centre — every line links somewhere, and the
 * single button opens the guided queue.
 */
export function MorningBrief({
  lines,
  canWorkQueue,
  dismissKey,
}: {
  lines: BriefLine[];
  /** Salespeople get "Start my day"; everyone else reviews the centre. */
  canWorkQueue: boolean;
  dismissKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [hidden, setHidden] = React.useState(false);

  if (hidden || !lines.length) return null;

  const total = lines.reduce((sum, l) => sum + l.count, 0);

  return (
    <section className="relative mb-5 overflow-hidden rounded-[16px] border border-ink-200 bg-white">
      {/* A warm sliver of colour, so the brief reads as the start of the day
          rather than another grey panel. */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-purple-500 to-warning-500" />

      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-warning-50 text-warning-600 ring-1 ring-warning-100 ring-inset">
            <Sunrise className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            {/* The greeting already sits in the page heading above, so the
                brief leads with what it is for instead of repeating it. */}
            <h2 className="font-display text-[18px] leading-tight font-semibold text-ink-950">
              {canWorkQueue ? "Your priority today" : "What needs attention today"}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {total} thing{total === 1 ? "" : "s"} in all, most urgent first.
            </p>

            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {lines.map((line) => (
                <li key={line.key}>
                  <Link
                    href={line.href}
                    className="group inline-flex items-center gap-2 text-[13.5px] text-ink-700 transition-colors hover:text-ink-950"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        ACTION_PRIORITY_META[line.priority].dot,
                      )}
                    />
                    <span>{line.label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href={canWorkQueue ? "/attention/day" : "/attention"}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-ink-900 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-800"
              >
                {canWorkQueue ? (
                  <>
                    <Zap className="size-4" />
                    Start my day
                  </>
                ) : (
                  <>
                    Review actions
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setHidden(true);
                    await dismissBrief(dismissKey);
                    router.refresh();
                  })
                }
                className="inline-flex h-10 items-center rounded-[10px] px-3 text-[13px] font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:opacity-50"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            type="button"
            aria-label="Hide today's brief"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setHidden(true);
                await dismissBrief(dismissKey);
                router.refresh();
              })
            }
            className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
