import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

export type TabItem = {
  href: string;
  label: string;
  count?: number;
  active?: boolean;
  tone?: BadgeTone;
};

/** URL-driven tabs. Horizontally scrollable on mobile so long tab sets stay usable. */
export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <div className={cn("hide-scrollbar -mx-1 overflow-x-auto", className)}>
      <div className="flex min-w-max items-center gap-1 border-b border-ink-200 px-1">
        {items.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
              tab.active
                ? "text-brand-700 after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-brand-600"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  tab.active ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Segmented control — compact alternative for 2-4 mutually exclusive views. */
export function SegmentedTabs({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[10px] border border-ink-200 bg-ink-50 p-0.5",
        className,
      )}
    >
      {items.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-all",
            tab.active
              ? "bg-white text-ink-900 shadow-xs"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[11px] text-ink-400 tabular-nums">{tab.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** Filter chips used above lists (status filters, quick presets). */
export function FilterChips({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <div className={cn("hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      {items.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
            chip.active
              ? "border-ink-900 bg-ink-900 text-white"
              : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
          )}
        >
          {chip.label}
          {chip.count !== undefined && (
            <span className={cn("text-[11px] tabular-nums", chip.active ? "text-white/70" : "text-ink-400")}>
              {chip.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
