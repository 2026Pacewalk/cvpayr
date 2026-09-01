"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Phone } from "lucide-react";
import { submitEnquiry, type EnquiryState } from "@/app/actions/enquiry";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { toDateTimeLocal } from "@/lib/utils";

export type EnquiryFormProps = {
  dealerSlug: string;
  vehicleId?: string;
  branchId?: string;
  branches?: { id: string; name: string; city: string }[];
  source?: string;
  /** Adds a date/time picker and files the enquiry as a test-drive request. */
  mode?: "enquiry" | "test_drive" | "callback" | "sell";
  compact?: boolean;
  defaultMessage?: string;
  title?: string;
  description?: string;
};

export function EnquiryForm({
  dealerSlug,
  vehicleId,
  branchId,
  branches,
  source = "website",
  mode = "enquiry",
  compact,
  defaultMessage,
  title,
  description,
}: EnquiryFormProps) {
  const [state, formAction] = useActionState<EnquiryState, FormData>(submitEnquiry, {
    status: "idle",
  });
  const [pageUrl, setPageUrl] = React.useState("");
  const [utm, setUtm] = React.useState({ source: "", medium: "", campaign: "" });

  // UTM parameters are read on the client so campaign attribution survives static caching.
  React.useEffect(() => {
    setPageUrl(window.location.href);
    const p = new URLSearchParams(window.location.search);
    setUtm({
      source: p.get("utm_source") ?? "",
      medium: p.get("utm_medium") ?? "",
      campaign: p.get("utm_campaign") ?? "",
    });
  }, []);

  if (state.status === "success") {
    return (
      <div className="rounded-[14px] border border-success-100 bg-success-50 p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-100 text-success-700">
          <CheckCircle2 className="size-6" />
        </span>
        <h3 className="mt-4 font-display text-[17px] font-semibold text-success-700">
          Enquiry received
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-success-700/80">{state.message}</p>
      </div>
    );
  }

  const minDateTime = toDateTimeLocal(new Date(Date.now() + 2 * 3600000));

  return (
    <form action={formAction} className="space-y-3.5">
      {title && (
        <div>
          <h3 className="font-display text-[16px] font-semibold text-ink-950">{title}</h3>
          {description && <p className="mt-1 text-[13px] text-ink-500">{description}</p>}
        </div>
      )}

      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="dealerSlug" value={dealerSlug} />
      {vehicleId && <input type="hidden" name="vehicleId" value={vehicleId} />}
      {branchId && !branches?.length && <input type="hidden" name="branchId" value={branchId} />}
      <input type="hidden" name="source" value={mode === "test_drive" ? "website" : source} />
      <input type="hidden" name="pageUrl" value={pageUrl} />
      <input type="hidden" name="utmSource" value={utm.source} />
      <input type="hidden" name="utmMedium" value={utm.medium} />
      <input type="hidden" name="utmCampaign" value={utm.campaign} />
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] size-0 opacity-0"
      />

      <div className={compact ? "space-y-3.5" : "grid gap-3.5 sm:grid-cols-2"}>
        <Field label="Your name" required error={state.fieldErrors?.name} htmlFor="eq-name">
          <Input id="eq-name" name="name" required placeholder="e.g. Rahul Sharma" autoComplete="name" />
        </Field>

        <Field label="Mobile number" required error={state.fieldErrors?.phone} htmlFor="eq-phone">
          <Input
            id="eq-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            prefix="+91"
            placeholder="98765 43210"
            autoComplete="tel"
          />
        </Field>

        {!compact && (
          <>
            <Field label="Email" hint="Optional" error={state.fieldErrors?.email} htmlFor="eq-email">
              <Input id="eq-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="City" hint="Optional" htmlFor="eq-city">
              <Input id="eq-city" name="city" placeholder="e.g. Ludhiana" autoComplete="address-level2" />
            </Field>
          </>
        )}
      </div>

      {branches && branches.length > 1 && (
        <Field label="Preferred showroom" htmlFor="eq-branch">
          <Select id="eq-branch" name="branchId" defaultValue={branchId ?? ""}>
            <option value="">Any showroom</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.city}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {mode === "test_drive" && (
        <Field
          label="Preferred date & time"
          required
          hint="We will confirm on WhatsApp before you travel."
          htmlFor="eq-td"
        >
          <Input id="eq-td" name="testDriveAt" type="datetime-local" required min={minDateTime} />
        </Field>
      )}

      {mode === "sell" && (
        <Field label="Your car details" required htmlFor="eq-req">
          <Textarea
            id="eq-req"
            name="requirement"
            required
            rows={3}
            placeholder="e.g. 2019 Maruti Swift VXi, 56,000 km, first owner, Ludhiana registration"
          />
        </Field>
      )}

      <Field label={mode === "sell" ? "Anything else" : "Message"} htmlFor="eq-msg">
        <Textarea
          id="eq-msg"
          name="message"
          rows={compact ? 2 : 3}
          defaultValue={defaultMessage}
          placeholder={
            mode === "test_drive"
              ? "Any questions before the test drive?"
              : "Tell us what you are looking for, or ask us anything about this car."
          }
        />
      </Field>

      <SubmitButton size="lg" fullWidth pendingLabel="Sending…">
        <Phone className="size-4" />
        {mode === "test_drive"
          ? "Book test drive"
          : mode === "callback"
            ? "Request a callback"
            : mode === "sell"
              ? "Get a valuation"
              : "Send enquiry"}
      </SubmitButton>

      <p className="text-center text-[11.5px] leading-relaxed text-ink-400">
        By submitting you agree to be contacted about this enquiry. We never share your number.
      </p>
    </form>
  );
}
