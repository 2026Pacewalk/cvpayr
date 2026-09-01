"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Building2, UserPlus, CreditCard } from "lucide-react";
import { createDealer, type AdminActionState } from "@/app/actions/admin";
import { Field, Input, Select, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { INDIAN_STATES, DEALER_STATUSES } from "@/lib/constants";
import { formatPrice, slugify } from "@/lib/utils";

export function NewDealerForm({
  plans,
}: {
  plans: { id: string; name: string; priceMonthly: number }[];
}) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(createDealer, {
    status: "idle",
  });
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");

  const effectiveSlug = slug || slugify(name);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not onboard">{state.message}</Alert>
      )}

      <FormSection title="Dealership" icon={<Building2 className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Dealership name" required error={state.fieldErrors?.name} htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kohli Motors"
            />
          </Field>
          <Field
            label="Public URL"
            hint={effectiveSlug ? `Showroom at /d/${effectiveSlug}` : "Generated from the name"}
            error={state.fieldErrors?.slug}
            htmlFor="slug"
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder={slugify(name) || "kohli-motors"}
            />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" placeholder="Jalandhar" />
          </Field>
          <Field label="State" htmlFor="state">
            <Select id="state" name="state" defaultValue="">
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Business phone" htmlFor="phone">
            <Input id="phone" name="phone" prefix="+91" inputMode="numeric" />
          </Field>
          <Field label="Business email" required error={state.fieldErrors?.email} htmlFor="email">
            <Input id="email" name="email" type="email" required placeholder="hello@dealership.in" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Owner account"
        description="The first login. They get the Dealer Owner role with full access."
        icon={<UserPlus className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Owner name" required error={state.fieldErrors?.ownerName} htmlFor="ownerName">
            <Input id="ownerName" name="ownerName" required placeholder="e.g. Amit Kohli" />
          </Field>
          <Field label="Owner email" required error={state.fieldErrors?.ownerEmail} htmlFor="ownerEmail">
            <Input id="ownerEmail" name="ownerEmail" type="email" required placeholder="owner@dealership.in" />
          </Field>
          <Field label="Temporary password" hint="Share it with the owner" htmlFor="password">
            <Input id="password" name="password" defaultValue="password123" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Subscription" icon={<CreditCard className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Plan" required error={state.fieldErrors?.planId} htmlFor="planId">
            <Select id="planId" name="planId" required defaultValue={plans[0]?.id}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p.priceMonthly)}/mo
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Initial status" htmlFor="status">
            <Select id="status" name="status" defaultValue="trial">
              {DEALER_STATUSES.filter((s) => s.value === "trial" || s.value === "active").map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <p className="mt-4 rounded-[10px] bg-ink-50 p-3.5 text-[12.5px] leading-relaxed text-ink-500">
          A trial gets 14 days by default and can be extended from the dealer detail page. The
          account is created with all six built-in roles and one branch, ready for the owner to
          start adding stock.
        </p>
      </FormSection>

      <div className="flex items-center gap-2.5">
        <Link
          href="/admin/dealers"
          className="inline-flex h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <SubmitButton size="lg" className="flex-1 sm:flex-none sm:px-8" pendingLabel="Creating…">
          Create dealership
        </SubmitButton>
      </div>
    </form>
  );
}
