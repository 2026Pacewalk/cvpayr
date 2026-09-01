"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

function useLockBody(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/**
 * Adaptive dialog: a centred modal from `sm` up, a native-feeling bottom sheet on phones.
 * This single component backs every dialog, drawer and filter sheet in the product.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  side = "auto",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** `auto` = bottom sheet on mobile, modal on desktop. `right` = side drawer on desktop. */
  side?: "auto" | "right";
}) {
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;

  const widths = {
    sm: "sm:max-w-md",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
    xl: "sm:max-w-4xl",
  }[size];

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div
          className="animate-fade-in absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          className={cn(
            "animate-sheet-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-white shadow-xl",
            "sm:animate-scale-in sm:max-h-[88vh] sm:rounded-[16px]",
            side === "right" &&
              "sm:absolute sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:rounded-none sm:rounded-l-[16px]",
            widths,
          )}
        >
          {/* Grab handle — mobile affordance */}
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-ink-200" />
          </div>

          {(title || description) && (
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
              <div className="min-w-0">
                {title && (
                  <h2 className="font-display text-[16px] font-semibold text-ink-950">{title}</h2>
                )}
                {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2 shrink-0">
                <X className="size-4" />
              </IconButton>
            </div>
          )}

          <div className="thin-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>

          {footer && (
            <div className="safe-bottom flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/** Confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-[8px] border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-9 rounded-[8px] px-3 text-[13px] font-medium text-white disabled:opacity-60",
              tone === "danger" ? "bg-danger-600 hover:bg-danger-700" : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-600">{message}</p>
    </Sheet>
  );
}

/** Lightweight popover anchored to a trigger, closes on outside click. */
export function Popover({
  trigger,
  children,
  align = "right",
  className,
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            "animate-scale-in absolute z-40 mt-2 min-w-[200px] origin-top rounded-[12px] border border-ink-200 bg-white p-1.5 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  destructive,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
        destructive
          ? "text-danger-600 hover:bg-danger-50"
          : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
