"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";
type Toast = { id: number; tone: ToastTone; title: string; description?: string };

const ToastContext = React.createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-[18px] text-success-600" />,
  error: <AlertCircle className="size-[18px] text-danger-600" />,
  info: <Info className="size-[18px] text-info-600" />,
  warning: <TriangleAlert className="size-[18px] text-warning-600" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);

  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[12px] border border-ink-200 bg-white p-3.5 shadow-lg"
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink-900">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mt-1 -mr-1 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fail soft: toasts are non-critical feedback.
    return {
      success: (_t: string, _d?: string) => {},
      error: (_t: string, _d?: string) => {},
      info: (_t: string, _d?: string) => {},
      warning: (_t: string, _d?: string) => {},
    };
  }
  return {
    success: (title: string, description?: string) =>
      ctx.push({ tone: "success", title, description }),
    error: (title: string, description?: string) => ctx.push({ tone: "error", title, description }),
    info: (title: string, description?: string) => ctx.push({ tone: "info", title, description }),
    warning: (title: string, description?: string) =>
      ctx.push({ tone: "warning", title, description }),
  };
}

/** Inline alert for form-level errors and plan-limit notices. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: ToastTone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles: Record<ToastTone, string> = {
    success: "border-success-100 bg-success-50 text-success-700",
    error: "border-danger-100 bg-danger-50 text-danger-700",
    info: "border-info-100 bg-info-50 text-info-700",
    warning: "border-warning-100 bg-warning-50 text-warning-700",
  };
  return (
    <div className={cn("flex gap-3 rounded-[12px] border p-3.5", styles[tone], className)}>
      <span className="mt-0.5 shrink-0">{ICONS[tone]}</span>
      <div className="min-w-0 text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
