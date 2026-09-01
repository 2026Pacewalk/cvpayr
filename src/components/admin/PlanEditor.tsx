"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Overlay";
import { Field, Input, Textarea, Switch, Checkbox, FormGrid } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { savePlan } from "@/app/actions/admin";
import { yearlyPrice, yearlySaving, YEARLY_DISCOUNT_PERCENT } from "@/lib/billing";
import { formatPrice } from "@/lib/utils";

const FEATURES = [
  { key: "crm", label: "CRM & pipeline" },
  { key: "customDomain", label: "Custom domain" },
  { key: "advancedReports", label: "Advanced reports" },
  { key: "customBranding", label: "Custom branding" },
  { key: "apiAccess", label: "API access" },
  { key: "prioritySupport", label: "Priority support" },
  { key: "bulkImport", label: "Bulk import" },
];

export function PlanEditor({
  plan,
}: {
  plan: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    priceMonthly: number;
    priceYearly: number;
    maxBranches: number;
    maxUsers: number;
    maxVehicles: number;
    maxImagesPerVehicle: number;
    storageMb: number;
    isActive: boolean;
    features: Record<string, boolean>;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [monthly, setMonthly] = React.useState(plan.priceMonthly);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Edit
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${plan.name}`}
        description="Limits apply instantly to every dealer on this plan."
        size="lg"
      >
        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await savePlan(plan.id, fd);
              if (res.status === "success") {
                toast.success("Plan saved");
                setOpen(false);
                router.refresh();
              } else {
                setError(res.message ?? "Could not save");
              }
            });
          }}
          className="space-y-5"
        >
          {error && <Alert tone="error">{error}</Alert>}

          <FormGrid columns={2}>
            <Field label="Plan name" required>
              <Input name="name" required defaultValue={plan.name} />
            </Field>
            <Field label="Code" required hint="Used internally, keep it stable">
              <Input name="code" required defaultValue={plan.code} />
            </Field>
          </FormGrid>

          <Field label="Description">
            <Textarea name="description" rows={2} defaultValue={plan.description ?? ""} />
          </Field>

          <div>
            <Field label="Monthly price" required hint="Yearly pricing is derived from this">
              <Input
                name="priceMonthly"
                type="number"
                required
                prefix="₹"
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value) || 0)}
              />
            </Field>

            <div className="mt-3 rounded-[10px] border border-ink-200 bg-ink-50 p-3.5">
              <p className="field-label mb-2">Yearly price — calculated automatically</p>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-[11.5px] text-ink-500">12 months at the monthly rate</p>
                  <p className="text-[14px] font-semibold text-ink-400 line-through tabular-nums">
                    {formatPrice(monthly * 12)}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-ink-500">{YEARLY_DISCOUNT_PERCENT}% yearly discount</p>
                  <p className="text-[14px] font-semibold text-warning-700 tabular-nums">
                    −{formatPrice(yearlySaving(monthly))}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-ink-500">Billed yearly</p>
                  <p className="font-display text-[18px] font-semibold text-ink-950 tabular-nums">
                    {formatPrice(yearlyPrice(monthly))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="field-label mb-3">Limits — use -1 for unlimited</p>
            <FormGrid columns={2}>
              <Field label="Max branches">
                <Input name="maxBranches" type="number" defaultValue={plan.maxBranches} />
              </Field>
              <Field label="Max staff accounts">
                <Input name="maxUsers" type="number" defaultValue={plan.maxUsers} />
              </Field>
              <Field label="Max vehicles in stock">
                <Input name="maxVehicles" type="number" defaultValue={plan.maxVehicles} />
              </Field>
              <Field label="Max images per vehicle">
                <Input name="maxImagesPerVehicle" type="number" min={1} defaultValue={plan.maxImagesPerVehicle} />
              </Field>
              <Field label="Storage (MB)">
                <Input name="storageMb" type="number" defaultValue={plan.storageMb} />
              </Field>
            </FormGrid>
          </div>

          <div>
            <p className="field-label mb-3">Feature flags</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <Checkbox
                  key={f.key}
                  name={`f_${f.key}`}
                  defaultChecked={plan.features[f.key]}
                  label={f.label}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-ink-100 pt-4">
            <Switch
              name="isActive"
              defaultChecked={plan.isActive}
              label="Plan is available"
              description="Hidden plans stay active for existing subscribers but cannot be chosen."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={pending}>Save plan</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
