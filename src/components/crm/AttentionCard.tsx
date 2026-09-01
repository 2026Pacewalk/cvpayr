"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PhoneMissed, UserPlus, CalendarClock, AlarmClock, CarFront, Handshake, Target,
  Timer, EyeOff, FileWarning, ImageOff, FilePen, Users, TrendingDown,
  ArrowRight, MoreHorizontal, Clock3, EyeOff as HideIcon, Shuffle,
} from "lucide-react";
import { Popover, MenuItem } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { dismissAction, autoAssignUnowned } from "@/app/actions/attention";
import {
  ACTION_META,
  ACTION_PRIORITY_META,
  SNOOZE_OPTIONS,
  type ActionIcon,
  type ActionItem,
} from "@/lib/attention";
import { cn } from "@/lib/utils";

const ICONS: Record<ActionIcon, typeof AlarmClock> = {
  phoneMissed: PhoneMissed,
  userPlus: UserPlus,
  calendarClock: CalendarClock,
  alarm: AlarmClock,
  car: CarFront,
  handshake: Handshake,
  target: Target,
  timer: Timer,
  eyeOff: EyeOff,
  fileWarning: FileWarning,
  imageOff: ImageOff,
  fileEdit: FilePen,
  users: Users,
  trendingDown: TrendingDown,
};

const TONE: Record<string, { wrap: string; icon: string; count: string; cta: string }> = {
  critical: {
    wrap: "border-danger-200 bg-danger-50/60 hover:border-danger-300",
    icon: "bg-white text-danger-600 ring-danger-100",
    count: "text-danger-700",
    cta: "text-danger-700 hover:text-danger-800",
  },
  high: {
    wrap: "border-warning-200 bg-warning-50/50 hover:border-warning-300",
    icon: "bg-white text-warning-600 ring-warning-100",
    count: "text-warning-800",
    cta: "text-warning-800 hover:text-warning-900",
  },
  medium: {
    wrap: "border-ink-200 bg-white hover:border-brand-300",
    icon: "bg-brand-50 text-brand-600 ring-brand-100",
    count: "text-ink-950",
    cta: "text-brand-700 hover:text-brand-800",
  },
  low: {
    wrap: "border-ink-200 bg-white hover:border-ink-300",
    icon: "bg-ink-100 text-ink-500 ring-ink-200",
    count: "text-ink-800",
    cta: "text-ink-600 hover:text-ink-900",
  },
};

/**
 * One piece of unresolved work.
 *
 * The number leads, because that is what a dealer scans for. Under it sits the
 * single fact that makes it urgent — "oldest waiting 47 min" — and then a
 * button that actually goes somewhere useful. Nothing here is decorative.
 */
export function AttentionCard({
  item,
  compact,
  canAssign,
}: {
  item: ActionItem;
  compact?: boolean;
  /** Enables the one-tap auto-assign on the unowned-leads card. */
  canAssign?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [hidden, setHidden] = React.useState(false);

  if (hidden) return null;

  const meta = ACTION_META[item.key];
  const Icon = ICONS[meta.icon] ?? AlarmClock;
  const tone = TONE[item.priority] ?? TONE.medium;
  const priorityMeta = ACTION_PRIORITY_META[item.priority];
  const canAutoAssign = Boolean(canAssign) && item.key === "leads.unassigned";

  const hide = (snooze: string | null) =>
    startTransition(async () => {
      const res = await dismissAction({
        actionId: item.id,
        actionKey: item.key,
        stateHash: item.stateHash,
        snooze,
      });
      if (res.status === "success") {
        setHidden(true);
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <div
      className={cn(
        "group relative flex gap-3.5 rounded-[14px] border p-4 transition-colors",
        tone.wrap,
        compact && "p-3.5",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[11px] ring-1 ring-inset",
          tone.icon,
          compact && "size-9",
        )}
      >
        <Icon className={compact ? "size-[18px]" : "size-5"} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-display leading-none font-semibold tabular-nums",
              compact ? "text-[20px]" : "text-[24px]",
              tone.count,
            )}
          >
            {item.count}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              priorityMeta.dot,
            )}
            title={`${priorityMeta.label} — ${priorityMeta.blurb}`}
          />
        </div>

        <p className="mt-1 text-[13.5px] leading-snug font-semibold text-ink-950">
          {item.title}
        </p>

        {item.detail && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">{item.detail}</p>
        )}

        {!compact && item.lines && item.lines.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {item.lines.map((line) => (
              <li key={line} className="text-[11.5px] leading-relaxed text-ink-500">
                {line}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1 text-[13px] font-semibold transition-colors",
              tone.cta,
            )}
          >
            {item.cta}
            <ArrowRight className="size-3.5" />
          </Link>

          {/* Spreads every unowned lead across the team without leaving the page. */}
          {canAutoAssign && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await autoAssignUnowned();
                  if (res.status === "success") toast.success(res.message);
                  else toast.error(res.message);
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50"
            >
              <Shuffle className="size-3.5" />
              Auto-assign
            </button>
          )}
        </div>
      </div>

      {/* Snooze and hide. Critical work is never permanently hideable — the
          server refuses it too, not just this menu. */}
      <div className="absolute top-2.5 right-2.5">
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-label="Snooze or hide"
              className="flex size-7 items-center justify-center rounded-[7px] text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-ink-600 focus-visible:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        >
          {(close) => (
            <div className="min-w-[190px] py-1">
              <p className="px-3 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                Remind me
              </p>
              {SNOOZE_OPTIONS.map((option) => (
                <MenuItem
                  key={option.value}
                  icon={<Clock3 className="size-4" />}
                  onClick={() => {
                    close();
                    hide(option.value);
                  }}
                >
                  In {option.label.toLowerCase()}
                </MenuItem>
              ))}
              {item.dismissible && (
                <>
                  <div className="my-1 border-t border-ink-100" />
                  <MenuItem
                    icon={<HideIcon className="size-4" />}
                    onClick={() => {
                      close();
                      hide(null);
                    }}
                  >
                    Hide until it changes
                  </MenuItem>
                </>
              )}
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}
