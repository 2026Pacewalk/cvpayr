import * as React from "react";
import Link from "next/link";
import { cn, buildQuery } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Responsive table shell.
 * On phones the caller renders `mobile` (a stack of cards); from `md` up the real
 * table takes over. This keeps a single source of data with two presentations.
 */
export function TableShell({
  children,
  mobile,
  className,
}: {
  children: React.ReactNode;
  mobile?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      {mobile && <div className="space-y-2.5 md:hidden">{mobile}</div>}
      <div
        className={cn(
          "overflow-hidden rounded-[14px] border border-ink-200 bg-white shadow-xs",
          mobile && "hidden md:block",
          className,
        )}
      >
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-full border-collapse text-left">{children}</table>
        </div>
      </div>
    </>
  );
}

export function Th({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-ink-200 bg-ink-50/70 px-4 py-2.5 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-ink-500 uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-[13px] text-ink-700",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
}) {
  return (
    <tr
      className={cn(
        "border-b border-ink-100 transition-colors last:border-0 hover:bg-ink-50/60",
        href && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Cell content that links to a detail page, keeping the whole row scannable. */
export function LinkCell({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("font-medium text-ink-900 hover:text-brand-700 hover:underline", className)}
    >
      {children}
    </Link>
  );
}

/* ============================= PAGINATION ============================== */

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params?: Record<string, string | number | undefined | null>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Windowed page numbers: 1 … 4 5 [6] 7 8 … 20
  const windowSize = 2;
  const pages: (number | "gap")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= windowSize) pages.push(i);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  const href = (p: number) => `${basePath}${buildQuery(params, { page: p === 1 ? undefined : p })}`;

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 px-1 py-3 sm:flex-row"
      aria-label="Pagination"
    >
      <p className="text-[12.5px] text-ink-500 tabular-nums">
        Showing <span className="font-medium text-ink-700">{from}</span>–
        <span className="font-medium text-ink-700">{to}</span> of{" "}
        <span className="font-medium text-ink-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
          <ChevronLeft className="size-4" />
        </PageLink>
        {pages.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1.5 text-ink-400">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex h-8 min-w-8 items-center justify-center rounded-[8px] px-2 text-[13px] font-medium tabular-nums transition-colors",
                p === page
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              {p}
            </Link>
          ),
        )}
        <PageLink href={href(page + 1)} disabled={page >= totalPages} label="Next page">
          <ChevronRight className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className="flex size-8 items-center justify-center rounded-[8px] text-ink-300"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-[8px] text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
