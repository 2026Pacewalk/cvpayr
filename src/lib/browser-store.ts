"use client";

import * as React from "react";

/**
 * Visitor-side lists (favourites, compare, recently viewed) live in localStorage.
 * Public browsing has no account, so the browser is the right home for them —
 * and it keeps the public site free of tracking.
 */

const KEYS = {
  favourites: "carvyapar:favourites",
  compare: "carvyapar:compare",
  recent: "carvyapar:recent",
} as const;

type ListKey = keyof typeof KEYS;

const listeners = new Set<() => void>();

function read(key: ListKey): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYS[key]);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: ListKey, value: string[]) {
  try {
    window.localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch {
    /* storage full or blocked — the feature degrades, nothing breaks */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Reactive access to one of the visitor lists. */
export function useVisitorList(key: ListKey, limit?: number) {
  const [items, setItems] = React.useState<string[]>([]);

  React.useEffect(() => {
    setItems(read(key));
    return subscribe(() => setItems(read(key)));
  }, [key]);

  const has = React.useCallback((id: string) => items.includes(id), [items]);

  const toggle = React.useCallback(
    (id: string) => {
      const current = read(key);
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [id, ...current].slice(0, limit ?? 100);
      write(key, next);
      return !current.includes(id);
    },
    [key, limit],
  );

  const add = React.useCallback(
    (id: string) => {
      const current = read(key).filter((x) => x !== id);
      write(key, [id, ...current].slice(0, limit ?? 100));
    },
    [key, limit],
  );

  const remove = React.useCallback(
    (id: string) => write(key, read(key).filter((x) => x !== id)),
    [key],
  );

  const clear = React.useCallback(() => write(key, []), [key]);

  return { items, has, toggle, add, remove, clear, count: items.length };
}

export const useFavourites = () => useVisitorList("favourites");
export const useCompare = () => useVisitorList("compare", 4);
export const useRecentlyViewed = () => useVisitorList("recent", 8);

/** Records a vehicle view once per mount. */
export function useTrackView(vehicleId: string) {
  const { add } = useRecentlyViewed();
  React.useEffect(() => {
    add(vehicleId);
  }, [vehicleId, add]);
}
