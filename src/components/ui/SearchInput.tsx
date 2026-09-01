"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Debounced, URL-driven search box. Writing the query into the URL keeps results
 * shareable, back-button friendly and server-rendered.
 */
export function SearchInput({
  placeholder = "Search…",
  paramName = "q",
  className,
  autoFocus,
}: {
  placeholder?: string;
  paramName?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(searchParams.get(paramName) ?? "");
  const [isPending, startTransition] = React.useTransition();
  const initial = React.useRef(true);

  // Keep in sync when the URL changes from elsewhere (filters cleared, back nav).
  React.useEffect(() => {
    setValue(searchParams.get(paramName) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get(paramName)]);

  React.useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(paramName, value);
      else params.delete(paramName);
      params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-[10px] border border-ink-200 bg-white pr-9 pl-9 text-ink-900 shadow-xs transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {isPending ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-400" />
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
