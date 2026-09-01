import * as React from "react";
import { cn, initials } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

/* ================================ BADGE ================================ */

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-600 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-100",
  warning: "bg-warning-50 text-warning-700 ring-warning-100",
  danger: "bg-danger-50 text-danger-700 ring-danger-100",
  info: "bg-info-50 text-info-700 ring-info-100",
  purple: "bg-purple-50 text-purple-700 ring-purple-100",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink-400",
  brand: "bg-brand-500",
  success: "bg-success-600",
  warning: "bg-warning-600",
  danger: "bg-danger-600",
  info: "bg-info-600",
  purple: "bg-purple-600",
};

const SOLID: Record<BadgeTone, string> = {
  neutral: "bg-ink-900/85 text-white",
  brand: "bg-brand-600 text-white",
  success: "bg-success-600 text-white",
  warning: "bg-warning-600 text-white",
  danger: "bg-danger-600 text-white",
  info: "bg-info-600 text-white",
  purple: "bg-purple-600 text-white",
};

export function Badge({
  tone = "neutral",
  dot,
  size = "md",
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Solid pill for photo overlays where contrast matters. */
export function OverlayBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-sm",
        SOLID[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ================================ CARD ================================= */

export function Card({
  className,
  children,
  padded = true,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  /** Anchor target, so notification deep links can scroll to a specific card. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-[14px] border border-ink-200 bg-white shadow-xs",
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink-100 text-ink-600">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink-900">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* =============================== AVATAR ================================ */

const AVATAR_SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-lg",
};

const TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-purple-100 text-purple-700",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-700",
  "bg-info-100 text-info-700",
  "bg-ink-200 text-ink-700",
];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return TINTS[h % TINTS.length];
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover ring-1 ring-ink-200", AVATAR_SIZES[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        AVATAR_SIZES[size],
        tintFor(name),
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/* ============================= EMPTY STATE ============================= */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-ink-200 bg-white text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      {icon && (
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          {icon}
        </span>
      )}
      <p className="text-[15px] font-semibold text-ink-900">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ============================== SKELETON =============================== */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-ink-200 bg-white">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-ink-100 rounded-[14px] border border-ink-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ============================== STAT CARD ============================== */

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: BadgeTone;
  trend?: { value: number; label?: string };
  className?: string;
}) {
  const iconTones: Record<BadgeTone, string> = {
    neutral: "bg-ink-100 text-ink-600",
    brand: "bg-brand-50 text-brand-600",
    success: "bg-success-50 text-success-600",
    warning: "bg-warning-50 text-warning-600",
    danger: "bg-danger-50 text-danger-600",
    info: "bg-info-50 text-info-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div
      className={cn(
        "rounded-[14px] border border-ink-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="field-label">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[8px]",
              iconTones[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-2xl leading-none font-semibold text-ink-950 tabular-nums">
        {value}
      </p>
      {(sub || trend) && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-500">
          {trend && (
            <span
              className={cn(
                "font-medium tabular-nums",
                trend.value >= 0 ? "text-success-700" : "text-danger-600",
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

/* ============================= PAGE HEADER ============================= */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:mb-6", className)}>
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-tight font-semibold text-ink-950 sm:text-[26px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13px] text-ink-500 sm:text-sm">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ============================== DATA LIST ============================== */

export function DataList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; hidden?: boolean }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const cols = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  }[columns];
  return (
    <dl className={cn("grid gap-x-4 gap-y-4", cols, className)}>
      {items
        .filter((i) => !i.hidden)
        .map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="field-label">{item.label}</dt>
            <dd className="mt-1 text-[13.5px] font-medium break-words text-ink-900">
              {item.value ?? "-"}
            </dd>
          </div>
        ))}
    </dl>
  );
}

/* ============================== PROGRESS =============================== */

export function ProgressBar({
  value,
  tone = "brand",
  className,
  height = "h-2",
}: {
  value: number;
  tone?: BadgeTone;
  className?: string;
  height?: string;
}) {
  const bar: Record<BadgeTone, string> = {
    neutral: "bg-ink-400",
    brand: "bg-brand-600",
    success: "bg-success-600",
    warning: "bg-warning-600",
    danger: "bg-danger-600",
    info: "bg-info-600",
    purple: "bg-purple-600",
  };
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-ink-100", height, className)}>
      <div
        className={cn("h-full rounded-full transition-all", bar[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ============================== SECTION ================================ */

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="font-display text-[15px] font-semibold text-ink-900">{children}</h2>
      {action}
    </div>
  );
}
