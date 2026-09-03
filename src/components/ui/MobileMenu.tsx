"use client";

import * as React from "react";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-screen mobile navigation.
 *
 * One overlay shell shared by the marketing site and the platform console so a
 * phone user meets the same navigation language everywhere. Deliberately not a
 * cramped dropdown: full height, large touch targets, and a layered dark field
 * (drifting colour + hairline grid) that reads as depth rather than decoration.
 */
export function MobileMenuOverlay({
  open,
  onClose,
  brand,
  eyebrow,
  children,
  footer,
  breakpoint = "md",
}: {
  open: boolean;
  onClose: () => void;
  brand: React.ReactNode;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Where the desktop navigation takes over. Must match the breakpoint used to
   * hide the trigger, or the hamburger opens nothing on tablet widths.
   */
  breakpoint?: "md" | "lg";
}) {
  // Lock the page behind the overlay and close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      className={cn("fixed inset-0 z-[70]", breakpoint === "lg" ? "lg:hidden" : "md:hidden")}
    >
      <div className="animate-overlay-in absolute inset-0 bg-ink-950/96 backdrop-blur-2xl" />

      {/* Atmosphere: two slow-drifting colour fields under a faint technical grid */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="menu-aurora absolute -top-32 -left-20 size-[440px] rounded-full bg-brand-600/30 blur-[120px]" />
        <div
          className="menu-aurora absolute top-1/3 -right-28 size-[380px] rounded-full bg-purple-600/20 blur-[120px]"
          style={{ animationDelay: "-6s" }}
        />
        <div className="menu-grid absolute inset-0" />
      </div>

      <div className="animate-menu-panel relative flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 items-center gap-2.5">{brand}</div>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors active:bg-white/15 active:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {eyebrow && (
          <p
            className="animate-menu-item shrink-0 px-5 pt-4 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-white/30 uppercase"
            style={{ animationDelay: "40ms" }}
          >
            {eyebrow}
          </p>
        )}

        <nav className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {children}
        </nav>

        {footer && (
          <div className="safe-bottom shrink-0 border-t border-white/10 px-5 pt-4 pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Editorial row for the marketing menu — numbered, typographic, unmistakably
 * a destination rather than a form control.
 */
export function MobileMenuLink({
  href,
  label,
  index,
  active,
  external,
  onClick,
  delay = 0,
}: {
  href: string;
  label: string;
  index?: number;
  active?: boolean;
  external?: boolean;
  onClick?: () => void;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      className="animate-menu-item group relative flex items-center gap-4 py-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      {index !== undefined && (
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums transition-colors",
            active ? "text-brand-300" : "text-white/25",
          )}
        >
          {String(index).padStart(2, "0")}
        </span>
      )}
      <span
        className={cn(
          "flex-1 font-display text-[24px] leading-none font-semibold tracking-[-0.02em] transition-colors",
          active ? "text-white" : "text-white/75 group-active:text-white",
        )}
      >
        {label}
      </span>
      {active && <span className="size-1.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px] shadow-brand-400/50" />}
      <ArrowUpRight
        className={cn(
          "size-5 shrink-0 transition-all",
          active ? "text-brand-300" : "text-white/20 group-active:translate-x-0.5 group-active:-translate-y-0.5 group-active:text-white/60",
        )}
      />
      <span className="menu-rule absolute inset-x-0 bottom-0 h-px" aria-hidden />
    </Link>
  );
}

/**
 * Denser row for the console menu — an icon chip and a line of context, because
 * platform sections need explaining in a way marketing links do not.
 */
export function MobileMenuItem({
  href,
  label,
  description,
  icon,
  active,
  external,
  onClick,
  delay = 0,
}: {
  href: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
  onClick?: () => void;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "animate-menu-item group relative flex items-center gap-3.5 rounded-[14px] border px-3.5 py-3.5 transition-colors",
        active
          ? "border-white/15 bg-white/10"
          : "border-white/5 bg-white/[0.03] active:bg-white/10",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400 shadow-[0_0_12px_1px] shadow-brand-400/60"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors",
          active
            ? "bg-brand-500/25 text-brand-200 ring-1 ring-brand-400/30"
            : "bg-white/5 text-white/45 ring-1 ring-white/10",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[15px] font-semibold transition-colors",
            active ? "text-white" : "text-white/80",
          )}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block truncate text-[12px] text-white/35">{description}</span>
        )}
      </span>
      <ArrowUpRight
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-brand-300" : "text-white/20",
        )}
      />
    </Link>
  );
}

/** The nine-dot mark. Drawn rather than imported so it inherits currentColor. */
function DotGrid() {
  return (
    <span aria-hidden className="grid grid-cols-3 gap-[3.2px]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="size-[3.4px] rounded-full bg-current" />
      ))}
    </span>
  );
}

/**
 * The menu button: a mark and the word, not three lines.
 *
 * The hamburger is a convention among people who use a lot of software. A
 * used-car buyer opening a dealership's site on their phone is not reliably one
 * of them, so the word carries the meaning and the mark carries the recognition.
 * The label also makes the target roughly twice the width of a 40px icon square,
 * which matters more on a phone than the pixels it costs.
 */
export function MobileMenuTrigger({
  open,
  onToggle,
  className,
  tone = "light",
  label = "Menu",
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
  /** `light` = for dark headers, `dark` = for white headers. */
  tone?: "light" | "dark";
  label?: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border px-3 text-[13.5px] font-semibold tracking-tight transition-colors",
        tone === "light"
          ? "border-white/20 bg-white/10 text-white active:bg-white/20"
          : "border-ink-200 bg-white text-ink-800 active:bg-ink-100",
        className,
      )}
    >
      {open ? <X className="size-4" /> : <DotGrid />}
      {open ? "Close" : label}
    </button>
  );
}
