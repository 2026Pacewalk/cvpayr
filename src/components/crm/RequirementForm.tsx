"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { UserSearch, Target, IndianRupee, MapPin } from "lucide-react";
import type { RequirementState } from "@/app/actions/requirements";
import {
  Field, Input, Select, Textarea, CheckChip, FormGrid, FormSection,
} from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import {
  FUEL_TYPES, TRANSMISSIONS, BODY_TYPES, POPULAR_MAKES, OWNERSHIP_OPTIONS,
  LEAD_PRIORITIES,
} from "@/lib/constants";
import { formatPrice, toDateInput } from "@/lib/utils";

export type RequirementValues = {
  customerId?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  make?: string | null;
  model?: string | null;
  fuelTypes?: string[];
  transmissions?: string[];
  bodyTypes?: string[];
  yearMin?: number | null;
  kmMax?: number | null;
  ownershipMax?: number | null;
  colour?: string | null;
  city?: string | null;
  branchId?: string | null;
  notes?: string | null;
  priority?: string;
  expiresAt?: Date | null;
};

const BUDGET_PRESETS = [
  { label: "Under ₹5 L", min: 0, max: 500000 },
  { label: "₹5–8 L", min: 500000, max: 800000 },
  { label: "₹8–12 L", min: 800000, max: 1200000 },
  { label: "₹12–18 L", min: 1200000, max: 1800000 },
  { label: "₹18–25 L", min: 1800000, max: 2500000 },
  { label: "Above ₹25 L", min: 2500000, max: 10000000 },
];

export function RequirementForm({
  action,
  branches,
  customers,
  values = {},
  lockedCustomer,
  submitLabel = "Save requirement",
  cancelHref = "/requirements",
}: {
  action: (prev: RequirementState, formData: FormData) => Promise<RequirementState>;
  branches: { id: string; name: string; city: string }[];
  customers: { id: string; name: string; phone: string }[];
  values?: RequirementValues;
  /** When set, the customer is fixed (e.g. creating from a customer profile). */
  lockedCustomer?: { id: string; name: string; phone: string };
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<RequirementState, FormData>(action, { status: "idle" });

  const [mode, setMode] = React.useState<"existing" | "new">(
    lockedCustomer || values.customerId ? "existing" : customers.length ? "existing" : "new",
  );
  const [budgetMin, setBudgetMin] = React.useState(values.budgetMin ?? 0);
  const [budgetMax, setBudgetMax] = React.useState(values.budgetMax ?? 0);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 16 }, (_, i) => currentYear - i);

  return (
    <form action={formAction} className="space-y-5 pb-32 lg:pb-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection
        title="Who is looking"
        description="Requirements attach to a customer record, so their whole history stays in one place."
        icon={<UserSearch className="size-4" />}
      >
        {lockedCustomer ? (
          <>
            <input type="hidden" name="customerId" value={lockedCustomer.id} />
            <div className="rounded-[10px] border border-ink-200 bg-ink-50 p-3.5">
              <p className="text-[14px] font-semibold text-ink-950">{lockedCustomer.name}</p>
              <p className="text-[12.5px] text-ink-500">{lockedCustomer.phone}</p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 inline-flex rounded-[10px] border border-ink-200 bg-ink-50 p-0.5">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    mode === m
                      ? "rounded-[8px] bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-xs"
                      : "rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium text-ink-500"
                  }
                >
                  {m === "existing" ? "Existing customer" : "New customer"}
                </button>
              ))}
            </div>

            {mode === "existing" ? (
              <Field label="Customer" required hint={`${customers.length} on file`}>
                <Select name="customerId" required defaultValue={values.customerId ?? ""}>
                  <option value="">Select a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <FormGrid columns={2}>
                <Field label="Customer name" required>
                  <Input name="customerName" placeholder="e.g. Rahul Sharma" />
                </Field>
                <Field
                  label="Mobile number"
                  required
                  hint="Matched against existing customers"
                  error={state.fieldErrors?.customerPhone}
                >
                  <Input name="customerPhone" prefix="+91" inputMode="numeric" placeholder="98765 43210" />
                </Field>
              </FormGrid>
            )}
          </>
        )}
      </FormSection>

      <FormSection
        title="Budget"
        description="The single most important filter. A ceiling is enough."
        icon={<IndianRupee className="size-4" />}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((p) => {
            const active = budgetMin === p.min && budgetMax === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setBudgetMin(p.min);
                  setBudgetMax(p.max);
                }}
                className={
                  active
                    ? "rounded-full border border-brand-500 bg-brand-50 px-3 py-1.5 text-[12.5px] font-medium text-brand-700"
                    : "rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 hover:border-ink-300"
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <FormGrid columns={2}>
          <Field label="Budget from" error={state.fieldErrors?.budgetMin}>
            <Input
              name="budgetMin"
              type="number"
              prefix="₹"
              inputMode="numeric"
              value={budgetMin || ""}
              onChange={(e) => setBudgetMin(Number(e.target.value) || 0)}
              placeholder="800000"
            />
          </Field>
          <Field label="Budget up to">
            <Input
              name="budgetMax"
              type="number"
              prefix="₹"
              inputMode="numeric"
              value={budgetMax || ""}
              onChange={(e) => setBudgetMax(Number(e.target.value) || 0)}
              placeholder="1200000"
            />
          </Field>
        </FormGrid>
        {(budgetMin > 0 || budgetMax > 0) && (
          <p className="mt-2 text-[12.5px] text-ink-500">
            Looking between {formatPrice(budgetMin)} and {formatPrice(budgetMax || 10000000)}
          </p>
        )}
      </FormSection>

      <FormSection
        title="What they want"
        description="Leave anything blank that the customer is flexible about — blanks are never counted against a car."
        icon={<Target className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Brand" hint="A brand miss rules a car out entirely">
            <Input name="make" list="req-makes" defaultValue={values.make ?? ""} placeholder="Any brand" />
            <datalist id="req-makes">
              {POPULAR_MAKES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Model">
            <Input name="model" defaultValue={values.model ?? ""} placeholder="e.g. Creta" />
          </Field>
        </FormGrid>

        <div className="mt-5 space-y-4">
          <div>
            <p className="field-label mb-2.5">Fuel — pick any that work</p>
            <div className="flex flex-wrap gap-2">
              {FUEL_TYPES.map((f) => (
                <CheckChip
                  key={f}
                  name="fuelTypes"
                  value={f}
                  label={f}
                  defaultChecked={values.fuelTypes?.includes(f)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-2.5">Transmission</p>
            <div className="flex flex-wrap gap-2">
              {TRANSMISSIONS.map((t) => (
                <CheckChip
                  key={t}
                  name="transmissions"
                  value={t}
                  label={t}
                  defaultChecked={values.transmissions?.includes(t)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-2.5">Body type</p>
            <div className="flex flex-wrap gap-2">
              {BODY_TYPES.map((b) => (
                <CheckChip
                  key={b}
                  name="bodyTypes"
                  value={b}
                  label={b}
                  defaultChecked={values.bodyTypes?.includes(b)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-ink-100 pt-5">
          <FormGrid columns={3}>
            <Field label="Year from">
              <Select name="yearMin" defaultValue={values.yearMin ?? ""}>
                <option value="">Any year</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y} or newer</option>
                ))}
              </Select>
            </Field>
            <Field label="Kilometres up to">
              <Select name="kmMax" defaultValue={values.kmMax ?? ""}>
                <option value="">Any</option>
                {[20000, 40000, 60000, 80000, 100000].map((km) => (
                  <option key={km} value={km}>
                    {new Intl.NumberFormat("en-IN").format(km)} km
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ownership">
              <Select name="ownershipMax" defaultValue={values.ownershipMax ?? ""}>
                <option value="">Any</option>
                {OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} or fewer</option>
                ))}
              </Select>
            </Field>
            <Field label="Colour preference" hint="Noted, never used to rule a car out">
              <Input name="colour" defaultValue={values.colour ?? ""} placeholder="e.g. White" />
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      <FormSection title="Where and how urgent" icon={<MapPin className="size-4" />}>
        <FormGrid columns={3}>
          <Field label="Preferred branch">
            <Select name="branchId" defaultValue={values.branchId ?? ""}>
              <option value="">Any branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={values.city ?? ""} placeholder="e.g. Ludhiana" />
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue={values.priority ?? "medium"}>
              {LEAD_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Stop matching after"
            hint="Optional — stale briefs stop producing matches"
          >
            <Input name="expiresAt" type="date" defaultValue={toDateInput(values.expiresAt)} />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <Field label="Notes" hint="Anything the fields above cannot capture">
            <Textarea
              name="notes"
              rows={3}
              defaultValue={values.notes ?? ""}
              placeholder="Wants a sunroof if possible. Exchanging a 2015 Swift. Can close within two weeks."
            />
          </Field>
        </div>
      </FormSection>

      <div className="above-tabbar safe-bottom fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,24,40,0.06)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <Link
          href={cancelHref}
          className="inline-flex h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <SubmitButton size="lg" className="flex-1 lg:flex-none lg:px-8" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
