"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { UserPlus, CarFront, Target } from "lucide-react";
import { createLead, type LeadActionState } from "@/app/actions/leads";
import { Field, Input, Select, Textarea, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { LEAD_SOURCES, LEAD_PRIORITIES } from "@/lib/constants";

export function NewLeadForm({
  branches,
  staff,
  vehicles,
  currentUserId,
  defaultVehicleId,
}: {
  branches: { id: string; name: string; city: string }[];
  staff: { id: string; name: string }[];
  vehicles: { id: string; label: string; branchId: string }[];
  currentUserId: string;
  defaultVehicleId?: string;
}) {
  const [state, formAction] = useActionState<LeadActionState, FormData>(createLead, {
    status: "idle",
  });

  const [branchId, setBranchId] = React.useState(
    defaultVehicleId ? (vehicles.find((v) => v.id === defaultVehicleId)?.branchId ?? "") : "",
  );

  // Only offer stock the chosen branch actually holds.
  const visibleVehicles = branchId ? vehicles.filter((v) => v.branchId === branchId) : vehicles;

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not create the lead">
          {state.message}
        </Alert>
      )}

      <FormSection
        title="Customer"
        description="If this mobile number already exists, the lead attaches to that customer."
        icon={<UserPlus className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Full name" required error={state.fieldErrors?.name} htmlFor="name">
            <Input id="name" name="name" required placeholder="e.g. Rahul Sharma" autoComplete="name" />
          </Field>
          <Field label="Mobile number" required error={state.fieldErrors?.phone} htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              required
              prefix="+91"
              inputMode="numeric"
              placeholder="98765 43210"
              autoComplete="tel"
            />
          </Field>
          <Field label="WhatsApp" hint="Leave blank to use the mobile number" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" prefix="+91" inputMode="numeric" />
          </Field>
          <Field label="Email" error={state.fieldErrors?.email} htmlFor="email">
            <Input id="email" name="email" type="email" placeholder="rahul@example.com" />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" placeholder="e.g. Ludhiana" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="What they want"
        description="Link a specific car, or capture the requirement in words."
        icon={<CarFront className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Branch" htmlFor="branchId">
            <Select
              id="branchId"
              name="branchId"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Any branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} — {b.city}</option>
              ))}
            </Select>
          </Field>

          <Field label="Interested vehicle" hint={`${visibleVehicles.length} in stock`} htmlFor="vehicleId">
            <Select id="vehicleId" name="vehicleId" defaultValue={defaultVehicleId ?? ""}>
              <option value="">Not decided yet</option>
              {visibleVehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Budget from" htmlFor="budgetMin">
            <Input id="budgetMin" name="budgetMin" type="number" prefix="₹" inputMode="numeric" placeholder="500000" />
          </Field>
          <Field label="Budget to" htmlFor="budgetMax">
            <Input id="budgetMax" name="budgetMax" type="number" prefix="₹" inputMode="numeric" placeholder="900000" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <Field
            label="Requirement"
            hint="e.g. Automatic SUV under ₹12 lakh, petrol, low kilometres"
            htmlFor="requirement"
          >
            <Input id="requirement" name="requirement" placeholder="Automatic SUV under ₹12 lakh" />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Notes" htmlFor="message">
            <Textarea
              id="message"
              name="message"
              rows={3}
              placeholder="Walked in with family. Comparing the Creta and the Seltos. Wants delivery before Diwali."
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Routing" description="Where this lead came from and who owns it." icon={<Target className="size-4" />}>
        <FormGrid columns={3}>
          <Field label="Source" htmlFor="source">
            <Select id="source" name="source" defaultValue="walk_in">
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue="medium">
              {LEAD_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Assign to" htmlFor="ownerId">
            <Select id="ownerId" name="ownerId" defaultValue={currentUserId}>
              <option value="auto">Auto-assign (round robin)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </FormGrid>
      </FormSection>

      <div className="flex items-center gap-2.5">
        <Link
          href="/leads"
          className="inline-flex h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <SubmitButton size="lg" className="flex-1 sm:flex-none sm:px-8" pendingLabel="Creating…">
          Create lead
        </SubmitButton>
      </div>
    </form>
  );
}
