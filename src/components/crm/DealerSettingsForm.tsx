"use client";

import { useActionState } from "react";
import { Building2, Phone, MapPin, Share2, Clock, Image as ImageIcon } from "lucide-react";
import type { OrgActionState } from "@/app/actions/org";
import { Field, Input, Textarea, Select, Checkbox, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { INDIAN_STATES } from "@/lib/constants";
import type { WorkingHour } from "@/server/dealer";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function DealerSettingsForm({
  action,
  values,
}: {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  values: {
    name: string;
    legalName: string | null;
    tagline: string | null;
    about: string | null;
    contactPerson: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    mapsUrl: string | null;
    gstin: string | null;
    panNumber: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    youtubeUrl: string | null;
    linkedinUrl: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    workingHours: WorkingHour[];
  };
}) {
  const [state, formAction] = useActionState<OrgActionState, FormData>(action, { status: "idle" });
  const hourFor = (day: string) => values.workingHours.find((h) => h.day === day);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "success" && (
        <Alert tone="success" title="Settings saved">
          Your public website has been updated too.
        </Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection title="Business identity" icon={<Building2 className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Dealership name" required htmlFor="name">
            <Input id="name" name="name" required defaultValue={values.name} />
          </Field>
          <Field label="Registered legal name" htmlFor="legalName">
            <Input id="legalName" name="legalName" defaultValue={values.legalName ?? ""} />
          </Field>
          <Field label="Contact person" htmlFor="contactPerson">
            <Input id="contactPerson" name="contactPerson" defaultValue={values.contactPerson ?? ""} />
          </Field>
          <Field label="Tagline" hint="One line under your name on the website" htmlFor="tagline">
            <Input id="tagline" name="tagline" defaultValue={values.tagline ?? ""} />
          </Field>
        </FormGrid>
        <div className="mt-4">
          <Field
            label="About the dealership"
            hint="Shown on your About page. Write it the way you would explain the business to a customer."
            htmlFor="about"
          >
            <Textarea id="about" name="about" rows={6} defaultValue={values.about ?? ""} />
          </Field>
        </div>
        <div className="mt-4">
          <FormGrid columns={2}>
            <Field label="GSTIN" htmlFor="gstin">
              <Input id="gstin" name="gstin" defaultValue={values.gstin ?? ""} className="uppercase" />
            </Field>
            <Field label="PAN" htmlFor="panNumber">
              <Input id="panNumber" name="panNumber" defaultValue={values.panNumber ?? ""} className="uppercase" />
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      <FormSection title="Contact" icon={<Phone className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" prefix="+91" inputMode="numeric" defaultValue={values.phone ?? ""} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" prefix="+91" inputMode="numeric" defaultValue={values.whatsapp ?? ""} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email ?? ""} />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input id="website" name="website" type="url" defaultValue={values.website ?? ""} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Head office address" icon={<MapPin className="size-4" />}>
        <div className="space-y-4">
          <Field label="Street address" htmlFor="addressLine">
            <Input id="addressLine" name="addressLine" defaultValue={values.addressLine ?? ""} />
          </Field>
          <FormGrid columns={3}>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={values.city ?? ""} />
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
              <Input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={values.pincode ?? ""} />
            </Field>
          </FormGrid>
          <Field label="Google Maps link" htmlFor="mapsUrl">
            <Input id="mapsUrl" name="mapsUrl" type="url" defaultValue={values.mapsUrl ?? ""} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Branding"
        description="Paste image URLs, or upload photos on a vehicle to get an uploaded URL."
        icon={<ImageIcon className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Logo URL" htmlFor="logoUrl">
            <Input id="logoUrl" name="logoUrl" type="url" defaultValue={values.logoUrl ?? ""} placeholder="https://…" />
          </Field>
          <Field label="Cover image URL" hint="Used behind your hero section" htmlFor="coverUrl">
            <Input id="coverUrl" name="coverUrl" type="url" defaultValue={values.coverUrl ?? ""} placeholder="https://…" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Social profiles" icon={<Share2 className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Facebook" htmlFor="facebookUrl">
            <Input id="facebookUrl" name="facebookUrl" type="url" defaultValue={values.facebookUrl ?? ""} />
          </Field>
          <Field label="Instagram" htmlFor="instagramUrl">
            <Input id="instagramUrl" name="instagramUrl" type="url" defaultValue={values.instagramUrl ?? ""} />
          </Field>
          <Field label="YouTube" htmlFor="youtubeUrl">
            <Input id="youtubeUrl" name="youtubeUrl" type="url" defaultValue={values.youtubeUrl ?? ""} />
          </Field>
          <Field label="LinkedIn" htmlFor="linkedinUrl">
            <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={values.linkedinUrl ?? ""} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Working hours"
        description="Shown on your About page and in the website footer."
        icon={<Clock className="size-4" />}
      >
        <div className="space-y-2.5">
          {DAYS.map((day) => {
            const h = hourFor(day);
            return (
              <div key={day} className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-3">
                <span className="text-[13px] font-medium text-ink-700">{day}</span>
                <Input type="time" name={`open_${day}`} defaultValue={h?.open ?? "09:30"} aria-label={`${day} opening time`} />
                <Input type="time" name={`close_${day}`} defaultValue={h?.close ?? "19:30"} aria-label={`${day} closing time`} />
                <Checkbox name={`closed_${day}`} defaultChecked={h?.closed} label="Closed" />
              </div>
            );
          })}
        </div>
      </FormSection>

      <div className="flex justify-end">
        <SubmitButton size="lg" className="px-8" pendingLabel="Saving…">
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
