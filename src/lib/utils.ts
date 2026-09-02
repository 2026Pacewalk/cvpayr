import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------------------- money ---------------------------- */

/** 1250000 -> "12.50 Lakh" ; 15000000 -> "1.50 Cr" */
export function formatIndianShort(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value >= 10000000) return `${trimZeros(value / 10000000)} Cr`;
  if (value >= 100000) return `${trimZeros(value / 100000)} Lakh`;
  if (value >= 1000) return `${trimZeros(value / 1000)} K`;
  return String(Math.round(value));
}

function trimZeros(n: number) {
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** 1250000 -> "Rs 12,50,000" using the Indian grouping system. */
export function formatINR(value: number | null | undefined, opts?: { symbol?: boolean }): string {
  if (value == null || Number.isNaN(value)) return "-";
  const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
  return opts?.symbol === false ? grouped : `₹${grouped}`;
}

/** Compact currency for cards and stat tiles: "₹12.50 L". */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value >= 10000000) return `₹${trimZeros(value / 10000000)} Cr`;
  if (value >= 100000) return `₹${trimZeros(value / 100000)} L`;
  return `₹${new Intl.NumberFormat("en-IN").format(value)}`;
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "-";
  return `${new Intl.NumberFormat("en-IN").format(km)} km`;
}

export function parseNumber(v: FormDataEntryValue | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------- dates ---------------------------- */

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const future = diff < 0;
  const fmt = (n: number, unit: string) =>
    future ? `in ${n} ${unit}${n === 1 ? "" : "s"}` : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (mins < 1) return "just now";
  if (mins < 60) return fmt(mins, "min");
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return fmt(days, "day");
  const months = Math.round(days / 30);
  if (months < 12) return fmt(months, "month");
  return fmt(Math.round(months / 12), "year");
}

export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function toDateTimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** For `<input type="datetime-local">`, which wants local time without a zone. */
export function toDateTimeInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/* ---------------------------- text ----------------------------- */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Normalise an Indian mobile number to 10 digits for duplicate detection. */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function whatsappHref(phone: string | null | undefined, message?: string): string {
  const digits = normalisePhone(phone ?? "");
  const number = digits.length === 10 ? `91${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${text}`;
}

export function telHref(phone: string | null | undefined): string {
  return `tel:+91${normalisePhone(phone ?? "")}`;
}

/* ---------------------------- misc ----------------------------- */

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Equated monthly instalment. rate is annual %, tenure in months. */
export function calculateEMI(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(emi);
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Build a query string preserving existing params. */
export function buildQuery(
  base: Record<string, string | number | undefined | null>,
  overrides: Record<string, string | number | undefined | null> = {},
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function vehicleTitle(v: {
  year: number;
  make: string;
  model: string;
  variant?: string | null;
}): string {
  return [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
}

/**
 * SEO-friendly vehicle URL segment, e.g.
 *   2023-hyundai-venue-sx-o-turbo-dct-stk-0017
 * The stock id is kept as the final token so the slug remains a stable, unique
 * lookup key even if the dealer later edits the variant or year.
 */
export function vehicleSlug(v: {
  year: number;
  make: string;
  model: string;
  variant?: string | null;
  stockId: string;
}): string {
  return `${slugify(vehicleTitle(v))}-${slugify(v.stockId)}`;
}

/**
 * Recovers the stock id from a vehicle slug. Accepts a bare stock id too, so
 * older links such as /cars/STK-0017 keep resolving.
 */
export function stockIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug);
  const match = decoded.match(/([a-z]+)-?(\d{3,})$/i);
  if (match) return `${match[1].toUpperCase()}-${match[2]}`;
  return decoded.toUpperCase();
}
