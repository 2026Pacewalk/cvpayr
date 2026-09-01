/**
 * Billing cycles.
 *
 * Plans are priced monthly. Paying yearly earns an automatic flat discount, so
 * the yearly figure is always derived — never typed in — and can never drift
 * from the monthly price it is based on.
 *
 * Pure functions only: this module is imported by the public pricing page as
 * well as the server, so it must stay free of `server-only` and Prisma.
 */

export const YEARLY_DISCOUNT_PERCENT = 10;

export const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number]["value"];

/** Full 12-month cost at the monthly rate, before the yearly discount. */
export function yearlyListPrice(priceMonthly: number): number {
  return priceMonthly * 12;
}

/** What a year actually costs — 12 months less the automatic discount. */
export function yearlyPrice(priceMonthly: number): number {
  return Math.round((priceMonthly * 12 * (100 - YEARLY_DISCOUNT_PERCENT)) / 100);
}

/** Rupees saved by paying yearly instead of monthly. */
export function yearlySaving(priceMonthly: number): number {
  return yearlyListPrice(priceMonthly) - yearlyPrice(priceMonthly);
}

/** The effective per-month rate when billed yearly — what the pricing card shows. */
export function yearlyMonthlyEquivalent(priceMonthly: number): number {
  return Math.round(yearlyPrice(priceMonthly) / 12);
}

/** The amount charged for one billing period on the given cycle. */
export function cyclePrice(priceMonthly: number, cycle: BillingCycle): number {
  return cycle === "yearly" ? yearlyPrice(priceMonthly) : priceMonthly;
}

export function cycleLabel(cycle: BillingCycle): string {
  return cycle === "yearly" ? "per year" : "per month";
}

export function cycleShortLabel(cycle: BillingCycle): string {
  return cycle === "yearly" ? "/yr" : "/mo";
}

/** Normalises whatever is stored on a subscription into a known cycle. */
export function normaliseCycle(value: string | null | undefined): BillingCycle {
  return value === "yearly" ? "yearly" : "monthly";
}

/**
 * Monthly-run-rate for a subscription, used for MRR maths.
 * A yearly subscription contributes one twelfth of its annual price.
 */
export function monthlyRunRate(priceMonthly: number, cycle: BillingCycle): number {
  return cycle === "yearly" ? Math.round(yearlyPrice(priceMonthly) / 12) : priceMonthly;
}
