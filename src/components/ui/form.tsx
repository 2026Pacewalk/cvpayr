import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const CONTROL =
  "w-full rounded-[10px] border border-ink-200 bg-white px-3 text-ink-900 shadow-xs placeholder:text-ink-400 transition-colors hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400";

/* ================================ FIELD ================================ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
  action,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-700">
            {label}
            {required && <span className="ml-0.5 text-danger-600">*</span>}
          </label>
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* ================================ INPUT ================================ */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    invalid?: boolean;
    /** Sits inside the field, before the value — currency, country code. */
    prefix?: string;
    /** Sits inside the field, after the value — a unit like "min" or "days". */
    suffix?: string;
  }
>(function Input({ className, invalid, prefix, suffix, ...props }, ref) {
  if (prefix || suffix) {
    return (
      <div
        className={cn(
          "flex items-center rounded-[10px] border border-ink-200 bg-white shadow-xs transition-colors focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10",
          invalid && "border-danger-400",
          className,
        )}
      >
        {prefix && (
          <span className="pl-3 text-[13px] font-medium text-ink-400 select-none">{prefix}</span>
        )}
        <input
          ref={ref}
          className={cn(
            "h-10 w-full min-w-0 rounded-[10px] bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none",
            prefix ? "px-2" : "pl-3 pr-2",
          )}
          {...props}
        />
        {suffix && (
          <span className="pr-3 text-[13px] font-medium text-ink-400 select-none">{suffix}</span>
        )}
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={cn(CONTROL, "h-10", invalid && "border-danger-400 focus:border-danger-500", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, "resize-y py-2.5 leading-relaxed", invalid && "border-danger-400", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL,
          "h-10 appearance-none pr-9",
          invalid && "border-danger-400",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden
      />
    </div>
  );
});

/* ============================== CHECKBOX =============================== */

export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; description?: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 select-none",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-[5px] border-ink-300 text-brand-600 accent-brand-600 focus:ring-2 focus:ring-brand-500/30"
        {...props}
      />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13.5px] leading-tight text-ink-800">{label}</span>}
          {description && <span className="mt-0.5 block text-[12px] text-ink-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** Checkbox rendered as a selectable chip — used for features and quick filters. */
export function CheckChip({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("group cursor-pointer select-none", className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span className="inline-flex items-center rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-600 transition-colors hover:border-ink-300 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40">
        {label}
      </span>
    </label>
  );
}

export function Radio({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 select-none", className)}>
      <input
        type="radio"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer border-ink-300 accent-brand-600 focus:ring-2 focus:ring-brand-500/30"
        {...props}
      />
      <span className="min-w-0">
        {label && <span className="block text-[13.5px] leading-tight text-ink-800">{label}</span>}
        {description && <span className="mt-0.5 block text-[12px] text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

/** Toggle switch backed by a real checkbox so it works inside plain forms. */
export function Switch({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4", className)}>
      <span className="min-w-0">
        {label && <span className="block text-[13.5px] font-medium text-ink-800">{label}</span>}
        {description && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">{description}</span>
        )}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="peer sr-only" {...props} />
        <span className="block h-6 w-11 rounded-full bg-ink-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/* ============================== LAYOUT ================================= */

export function FormGrid({
  children,
  columns = 2,
  className,
}: {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const cols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }[columns];
  return <div className={cn("grid gap-4", cols, className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
  icon,
  aside,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-[14px] border border-ink-200 bg-white shadow-xs", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-50 text-brand-600">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
            {description && <p className="mt-0.5 text-[12.5px] text-ink-500">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Highlighted block for margin / cost fields that only privileged roles see. */
export function PrivateBlock({
  children,
  title = "Private — visible to authorised roles only",
  className,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[12px] border border-warning-100 bg-warning-50/60 p-4", className)}>
      <p className="field-label mb-3 text-warning-700">{title}</p>
      {children}
    </div>
  );
}
