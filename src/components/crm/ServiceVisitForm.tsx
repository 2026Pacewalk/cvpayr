"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { UserSearch, Car, Wrench, ClipboardList } from "lucide-react";
import type { ServiceActionState } from "@/app/actions/service";
import { Field, Input, Select, Textarea, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { POPULAR_MAKES } from "@/lib/constants";
import { toDateTimeInput } from "@/lib/utils";

const SERVICE_TYPES = [
  { value: "periodic", label: "Periodic service" },
  { value: "repair", label: "Repair" },
  { value: "bodyshop", label: "Bodyshop" },
  { value: "warranty", label: "Warranty" },
  { value: "accessories", label: "Accessories / fitment" },
  { value: "other", label: "Other" },
];

export type ServiceValues = {
  registrationNumber?: string | null;
  make?: string | null;
  model?: string | null;
  odometerKm?: number | null;
  serviceType?: string;
  complaint?: string | null;
  workDone?: string | null;
  amount?: number | null;
  promisedAt?: Date | null;
  assignedToId?: string | null;
  branchId?: string | null;
  notes?: string | null;
  jobCardNumber?: string | null;
};

export function ServiceVisitForm({
  action,
  branches,
  advisors,
  customers,
  values = {},
  lockedCustomer,
  submitLabel = "Book the car in",
  cancelHref = "/service",
  showOutcome,
}: {
  action: (prev: ServiceActionState, formData: FormData) => Promise<ServiceActionState>;
  branches: { id: string; name: string }[];
  advisors: { id: string; name: string }[];
  customers: { id: string; name: string; phone: string }[];
  values?: ServiceValues;
  lockedCustomer?: { id: string; name: string; phone: string };
  submitLabel?: string;
  cancelHref?: string;
  /** The edit screen also captures work done and the invoice. */
  showOutcome?: boolean;
}) {
  const [state, formAction] = useActionState<ServiceActionState, FormData>(action, {
    status: "idle",
  });
  const [mode, setMode] = React.useState<"existing" | "new">(
    lockedCustomer || customers.length ? "existing" : "new",
  );

  return (
    <form action={formAction} className="space-y-5 pb-32 lg:pb-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}
      {state.status === "success" && state.message && (
        <Alert tone="success" title="Saved">{state.message}</Alert>
      )}

      {!lockedCustomer && (
        <FormSection
          title="Whose car is it?"
          description="Matched on mobile number, so a customer who bought from you keeps one history."
          icon={<UserSearch className="size-4" />}
        >
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
              <Select name="customerId" required>
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
                hint="The feedback SMS goes here"
                error={state.fieldErrors?.customerPhone}
              >
                <Input name="customerPhone" prefix="+91" inputMode="numeric" placeholder="98765 43210" />
              </Field>
            </FormGrid>
          )}
        </FormSection>
      )}

      {lockedCustomer && <input type="hidden" name="customerId" value={lockedCustomer.id} />}

      <FormSection title="The car" icon={<Car className="size-4" />}>
        <FormGrid columns={3}>
          <Field label="Registration number">
            <Input
              name="registrationNumber"
              defaultValue={values.registrationNumber ?? ""}
              placeholder="PB10 AB 1234"
              className="uppercase"
            />
          </Field>
          <Field label="Make">
            <Input name="make" list="svc-makes" defaultValue={values.make ?? ""} placeholder="Hyundai" />
            <datalist id="svc-makes">
              {POPULAR_MAKES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Model">
            <Input name="model" defaultValue={values.model ?? ""} placeholder="Creta" />
          </Field>
          <Field label="Odometer">
            <Input
              name="odometerKm"
              type="number"
              inputMode="numeric"
              defaultValue={values.odometerKm ?? ""}
              placeholder="42000"
            />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="The job" icon={<Wrench className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Type of work">
            <Select name="serviceType" defaultValue={values.serviceType ?? "periodic"}>
              {SERVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Promised back by">
            <Input
              name="promisedAt"
              type="datetime-local"
              defaultValue={toDateTimeInput(values.promisedAt)}
            />
          </Field>
          <Field label="Job card number" hint="Leave blank and one is generated">
            <Input name="jobCardNumber" defaultValue={values.jobCardNumber ?? ""} placeholder="JC-0001" />
          </Field>
          <Field label="Service advisor">
            <Select name="assignedToId" defaultValue={values.assignedToId ?? ""}>
              <option value="">Unassigned</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          {branches.length > 1 && (
            <Field label="Branch">
              <Select name="branchId" defaultValue={values.branchId ?? ""}>
                <option value="">Any branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </FormGrid>

        <div className="mt-4">
          <Field label="What the customer reported" hint="In their words, not yours">
            <Textarea
              name="complaint"
              rows={3}
              defaultValue={values.complaint ?? ""}
              placeholder="Rattling from the front right when going over speed breakers. AC not cooling below 24."
            />
          </Field>
        </div>
      </FormSection>

      {showOutcome && (
        <FormSection title="Outcome" icon={<ClipboardList className="size-4" />}>
          <Field label="Work done">
            <Textarea name="workDone" rows={3} defaultValue={values.workDone ?? ""} />
          </Field>
          <div className="mt-4">
            <FormGrid columns={2}>
              <Field label="Invoice total">
                <Input
                  name="amount"
                  type="number"
                  prefix="₹"
                  inputMode="numeric"
                  defaultValue={values.amount ?? ""}
                />
              </Field>
            </FormGrid>
          </div>
          <div className="mt-4">
            <Field label="Internal notes" hint="Not shown to the customer">
              <Textarea name="notes" rows={2} defaultValue={values.notes ?? ""} />
            </Field>
          </div>
        </FormSection>
      )}

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
