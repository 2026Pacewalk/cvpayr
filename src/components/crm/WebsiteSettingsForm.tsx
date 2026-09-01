"use client";

import { useActionState } from "react";
import { Sparkles, Search, LayoutGrid, ShieldCheck } from "lucide-react";
import type { OrgActionState } from "@/app/actions/org";
import { Field, Input, Textarea, Select, Switch, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import type { WhyChooseUsItem } from "@/server/dealer";

const ICON_OPTIONS = [
  { value: "shield", label: "Shield — inspection / trust" },
  { value: "file", label: "Document — paperwork" },
  { value: "wallet", label: "Wallet — finance" },
  { value: "repeat", label: "Exchange — returns" },
];

export function WebsiteSettingsForm({
  action,
  values,
}: {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  values: {
    heroHeadline: string | null;
    heroSubheadline: string | null;
    heroImageUrl: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    showFinance: boolean;
    showSellYourCar: boolean;
    showTestimonials: boolean;
    isPublished: boolean;
    whyChooseUs: WhyChooseUsItem[];
  };
}) {
  const [state, formAction] = useActionState<OrgActionState, FormData>(action, { status: "idle" });

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "success" && (
        <Alert tone="success" title="Website updated">Your showroom reflects the changes now.</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection
        title="Hero section"
        description="The first thing a customer reads. Say something specific, not generic."
        icon={<Sparkles className="size-4" />}
      >
        <div className="space-y-4">
          <Field label="Headline" htmlFor="heroHeadline">
            <Input
              id="heroHeadline"
              name="heroHeadline"
              defaultValue={values.heroHeadline ?? ""}
              placeholder="Find your next car, without the guesswork"
            />
          </Field>
          <Field label="Sub-headline" htmlFor="heroSubheadline">
            <Textarea
              id="heroSubheadline"
              name="heroSubheadline"
              rows={2}
              defaultValue={values.heroSubheadline ?? ""}
              placeholder="Every car inspected on 140 points, priced fairly, backed by paperwork you can verify."
            />
          </Field>
          <Field label="Hero background image URL" htmlFor="heroImageUrl">
            <Input
              id="heroImageUrl"
              name="heroImageUrl"
              type="url"
              defaultValue={values.heroImageUrl ?? ""}
              placeholder="https://…"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Why choose us"
        description="Four reasons a customer should buy from you rather than the dealer down the road."
        icon={<ShieldCheck className="size-4" />}
      >
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => {
            const item = values.whyChooseUs[i];
            return (
              <div key={i} className="rounded-[10px] border border-ink-200 p-4">
                <p className="field-label mb-3">Point {i + 1}</p>
                <FormGrid columns={2}>
                  <Field label="Icon">
                    <Select name={`why_icon_${i}`} defaultValue={item?.icon ?? ICON_OPTIONS[i]?.value ?? "shield"}>
                      {ICON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Title" hint="Leave blank to hide this point">
                    <Input name={`why_title_${i}`} defaultValue={item?.title ?? ""} placeholder="140-point inspection" />
                  </Field>
                </FormGrid>
                <div className="mt-4">
                  <Field label="Description">
                    <Textarea
                      name={`why_body_${i}`}
                      rows={2}
                      defaultValue={item?.body ?? ""}
                      placeholder="Engine, suspension, electricals and paint checked before a car reaches our floor."
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        title="Pages & sections"
        description="Turn parts of the website on or off."
        icon={<LayoutGrid className="size-4" />}
      >
        <div className="space-y-4">
          <Switch
            name="isPublished"
            defaultChecked={values.isPublished}
            label="Website is published"
            description="Turn off to take the whole showroom offline while you prepare stock."
          />
          <div className="border-t border-ink-100 pt-4">
            <Switch
              name="showFinance"
              defaultChecked={values.showFinance}
              label="Finance page"
              description="EMI calculator, documents needed and an eligibility enquiry form."
            />
          </div>
          <div className="border-t border-ink-100 pt-4">
            <Switch
              name="showSellYourCar"
              defaultChecked={values.showSellYourCar}
              label="Sell Your Car page"
              description="Valuation enquiries land in your CRM as leads."
            />
          </div>
          <div className="border-t border-ink-100 pt-4">
            <Switch
              name="showTestimonials"
              defaultChecked={values.showTestimonials}
              label="Customer testimonials"
              description="Shown on the homepage below the branch list."
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Search engine listing"
        description="How your showroom appears in Google results."
        icon={<Search className="size-4" />}
      >
        <div className="space-y-4">
          <Field label="Page title" hint="Around 60 characters" htmlFor="metaTitle">
            <Input
              id="metaTitle"
              name="metaTitle"
              maxLength={70}
              defaultValue={values.metaTitle ?? ""}
              placeholder="Sharma Auto Wheels — Certified Pre-Owned Cars in Ludhiana"
            />
          </Field>
          <Field label="Meta description" hint="Around 155 characters" htmlFor="metaDescription">
            <Textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              maxLength={200}
              defaultValue={values.metaDescription ?? ""}
              placeholder="Browse inspected pre-owned cars across three showrooms. Transparent pricing, verified service history and easy finance."
            />
          </Field>
          <p className="rounded-[10px] bg-ink-50 p-3.5 text-[12.5px] leading-relaxed text-ink-500">
            Every vehicle page already gets an SEO-friendly URL, a unique title, an Open Graph image
            and Car structured data, so listings can appear as rich results.
          </p>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <SubmitButton size="lg" className="px-8" pendingLabel="Publishing…">
          Save & publish
        </SubmitButton>
      </div>
    </form>
  );
}
