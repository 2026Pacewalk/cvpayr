"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Building2, Phone, Clock } from "lucide-react";
import type { OrgActionState } from "@/app/actions/org";
import { Field, Input, Select, Textarea, Switch, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { INDIAN_STATES } from "@/lib/constants";

export type BranchFormValues = {
  name?: string;
  code?: string;
  addressLine?: string | null;
  city?: string;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  openingHours?: string | null;
  mapsUrl?: string | null;
  managerId?: string | null;
  isActive?: boolean;
};

export function BranchForm({
  action,
  managers,
  values = {},
  submitLabel = "Create branch",
}: {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  managers: { id: string; name: string }[];
  values?: BranchFormValues;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<OrgActionState, FormData>(action, { status: "idle" });

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection title="Branch identity" icon={<Building2 className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Branch name" required error={state.fieldErrors?.name} htmlFor="name">
            <Input id="name" name="name" required defaultValue={values.name} placeholder="e.g. Ludhiana Showroom" />
          </Field>
          <Field
            label="Branch code"
            required
            hint="Short code used on stock and reports"
            error={state.fieldErrors?.code}
            htmlFor="code"
          >
            <Input
              id="code"
              name="code"
              required
              maxLength={8}
              defaultValue={values.code}
              placeholder="LDH"
              className="uppercase"
            />
          </Field>
          <Field label="Branch manager" htmlFor="managerId">
            <Select id="managerId" name="managerId" defaultValue={values.managerId ?? ""}>
              <option value="">Not assigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Switch
              name="isActive"
              defaultChecked={values.isActive ?? true}
              label="Branch is active"
              description="Inactive branches are hidden from your public website."
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="Address" icon={<Building2 className="size-4" />}>
        <div className="space-y-4">
          <Field label="Street address" htmlFor="addressLine">
            <Input id="addressLine" name="addressLine" defaultValue={values.addressLine ?? ""} placeholder="Plot 44, GT Road, Near Bus Stand" />
          </Field>
          <FormGrid columns={3}>
            <Field label="City" required error={state.fieldErrors?.city} htmlFor="city">
              <Input id="city" name="city" required defaultValue={values.city} placeholder="Ludhiana" />
            </Field>
            <Field label="State" htmlFor="state">
              <Select id="state" name="state" defaultValue={values.state ?? ""}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="PIN code" htmlFor="pincode">
              <Input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={values.pincode ?? ""} placeholder="141003" />
            </Field>
          </FormGrid>
          <Field label="Google Maps link" hint="Used for the Directions button on your website" htmlFor="mapsUrl">
            <Input id="mapsUrl" name="mapsUrl" type="url" defaultValue={values.mapsUrl ?? ""} placeholder="https://maps.google.com/?q=…" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Contact & hours" icon={<Phone className="size-4" />}>
        <FormGrid columns={3}>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" prefix="+91" inputMode="numeric" defaultValue={values.phone ?? ""} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" prefix="+91" inputMode="numeric" defaultValue={values.whatsapp ?? ""} />
          </Field>
          <Field label="Email" error={state.fieldErrors?.email} htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email ?? ""} placeholder="branch@dealership.in" />
          </Field>
        </FormGrid>
        <div className="mt-4">
          <Field label="Opening hours" hint="Shown on the branch card and vehicle pages" htmlFor="openingHours">
            <Input
              id="openingHours"
              name="openingHours"
              defaultValue={values.openingHours ?? ""}
              placeholder="Mon-Sat 9:30 AM - 7:30 PM, Sun 11 AM - 5 PM"
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex items-center gap-2.5">
        <Link
          href="/branches"
          className="inline-flex h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <SubmitButton size="lg" className="flex-1 sm:flex-none sm:px-8" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
