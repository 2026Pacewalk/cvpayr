"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  Camera, Car, IndianRupee, ClipboardCheck, Sparkles, Globe, Lock, Info,
} from "lucide-react";
import { ImageUploader } from "./ImageUploader";
import { Field, Input, Textarea, Select, Checkbox, CheckChip, Switch, FormGrid, FormSection, PrivateBlock } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/app/actions/vehicles";
import {
  FUEL_TYPES, TRANSMISSIONS, BODY_TYPES, POPULAR_MAKES, INDIAN_STATES,
  OWNERSHIP_OPTIONS, INSURANCE_STATUSES, SERVICE_HISTORY_OPTIONS, FEATURE_GROUPS,
  VEHICLE_STATUSES, VEHICLE_STATUS_META, type VehicleStatus,
} from "@/lib/constants";
import { formatPrice, toDateInput } from "@/lib/utils";

export type VehicleFormValues = {
  id?: string;
  branchId?: string;
  stockId?: string;
  registrationNumber?: string | null;
  make?: string;
  model?: string;
  variant?: string | null;
  year?: number;
  registrationYear?: number | null;
  fuelType?: string;
  transmission?: string;
  bodyType?: string;
  colour?: string | null;
  ownership?: number;
  kmDriven?: number;
  registrationState?: string | null;
  rto?: string | null;
  insuranceStatus?: string | null;
  insuranceValidTill?: Date | null;
  fitnessValidTill?: Date | null;
  pucValidTill?: Date | null;
  sellingPrice?: number;
  originalPrice?: number | null;
  negotiable?: boolean;
  minAcceptablePrice?: number | null;
  purchasePrice?: number | null;
  refurbishmentCost?: number | null;
  conditionRating?: number | null;
  serviceHistory?: string | null;
  accidental?: boolean;
  floodDamaged?: boolean;
  repaintedPanels?: number;
  tyreCondition?: string | null;
  batteryCondition?: string | null;
  engineCondition?: string | null;
  interiorCondition?: string | null;
  exteriorCondition?: string | null;
  numberOfKeys?: number;
  serviceRecordsAvailable?: boolean;
  rcAvailable?: boolean;
  insuranceAvailable?: boolean;
  description?: string | null;
  internalNotes?: string | null;
  status?: string;
  isFeatured?: boolean;
  features?: string[];
  imageUrls?: string[];
  coverIndex?: number;
  youtubeUrl?: string;
};

export function VehicleForm({
  action,
  branches,
  values = {},
  canSeeCost,
  maxImages,
  suggestedStockId,
  submitLabel = "Save vehicle",
  cancelHref = "/inventory",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  branches: { id: string; name: string; city: string }[];
  values?: VehicleFormValues;
  canSeeCost: boolean;
  maxImages: number;
  suggestedStockId?: string;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, { status: "idle" });

  const [sellingPrice, setSellingPrice] = React.useState(values.sellingPrice ?? 0);
  const [purchasePrice, setPurchasePrice] = React.useState(values.purchasePrice ?? 0);
  const [refurb, setRefurb] = React.useState(values.refurbishmentCost ?? 0);

  const cost = Number(purchasePrice || 0) + Number(refurb || 0);
  const profit = Number(sellingPrice || 0) - cost;
  const marginPct = cost ? Math.round((profit / cost) * 1000) / 10 : 0;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 26 }, (_, i) => currentYear + 1 - i);
  const selectedFeatures = values.features ?? [];

  const knownKeys = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.key));
  const customFeatures = selectedFeatures.filter((f) => !knownKeys.includes(f));

  return (
    <form action={formAction} className="space-y-5 pb-32 lg:pb-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">
          {state.message}
        </Alert>
      )}

      {/* ─────────────────────────── PHOTOS ─────────────────────────── */}
      <FormSection
        title="Photos & media"
        description="Good photography sells cars. Aim for 8-15 shots in daylight."
        icon={<Camera className="size-4" />}
      >
        <ImageUploader
          initialUrls={values.imageUrls ?? []}
          initialCoverIndex={values.coverIndex ?? 0}
          maxImages={maxImages}
        />
        <div className="mt-4">
          <Field
            label="Walkaround video (YouTube)"
            hint="Paste a YouTube link and it will play inside the gallery."
            htmlFor="youtubeUrl"
          >
            <Input
              id="youtubeUrl"
              name="youtubeUrl"
              type="url"
              defaultValue={values.youtubeUrl ?? ""}
              placeholder="https://youtube.com/watch?v=…"
            />
          </Field>
        </div>
      </FormSection>

      {/* ────────────────────────── BASICS ──────────────────────────── */}
      <FormSection
        title="Vehicle details"
        description="What the car is, and what the paperwork says."
        icon={<Car className="size-4" />}
      >
        <FormGrid columns={3}>
          <Field label="Branch" required error={state.fieldErrors?.branchId} htmlFor="branchId">
            <Select id="branchId" name="branchId" required defaultValue={values.branchId ?? branches[0]?.id}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.city}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Stock ID" hint="Leave blank to auto-generate" htmlFor="stockId">
            <Input
              id="stockId"
              name="stockId"
              defaultValue={values.stockId}
              placeholder={suggestedStockId ?? "STK-0001"}
            />
          </Field>

          <Field
            label="Registration number"
            error={state.fieldErrors?.registrationNumber}
            hint="Used to catch duplicate entries"
            htmlFor="registrationNumber"
          >
            <Input
              id="registrationNumber"
              name="registrationNumber"
              defaultValue={values.registrationNumber ?? ""}
              placeholder="PB10AB1234"
              className="uppercase"
              invalid={Boolean(state.fieldErrors?.registrationNumber)}
            />
          </Field>

          <Field label="Brand" required error={state.fieldErrors?.make} htmlFor="make">
            <Input
              id="make"
              name="make"
              required
              list="make-options"
              defaultValue={values.make}
              placeholder="e.g. Hyundai"
            />
            <datalist id="make-options">
              {POPULAR_MAKES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <Field label="Model" required error={state.fieldErrors?.model} htmlFor="model">
            <Input id="model" name="model" required defaultValue={values.model} placeholder="e.g. Creta" />
          </Field>

          <Field label="Variant" htmlFor="variant">
            <Input id="variant" name="variant" defaultValue={values.variant ?? ""} placeholder="e.g. SX (O) 1.5 Petrol" />
          </Field>

          <Field label="Manufacturing year" required error={state.fieldErrors?.year} htmlFor="year">
            <Select id="year" name="year" required defaultValue={values.year ?? currentYear - 2}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>

          <Field label="Registration year" htmlFor="registrationYear">
            <Select id="registrationYear" name="registrationYear" defaultValue={values.registrationYear ?? values.year ?? currentYear - 2}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>

          <Field label="Kilometres driven" required error={state.fieldErrors?.kmDriven} htmlFor="kmDriven">
            <Input
              id="kmDriven"
              name="kmDriven"
              type="number"
              inputMode="numeric"
              required
              min={0}
              defaultValue={values.kmDriven ?? ""}
              placeholder="35000"
            />
          </Field>

          <Field label="Fuel type" required htmlFor="fuelType">
            <Select id="fuelType" name="fuelType" required defaultValue={values.fuelType ?? "Petrol"}>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </Field>

          <Field label="Transmission" required htmlFor="transmission">
            <Select id="transmission" name="transmission" required defaultValue={values.transmission ?? "Manual"}>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>

          <Field label="Body type" required htmlFor="bodyType">
            <Select id="bodyType" name="bodyType" required defaultValue={values.bodyType ?? "Hatchback"}>
              {BODY_TYPES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </Field>

          <Field label="Colour" htmlFor="colour">
            <Input id="colour" name="colour" defaultValue={values.colour ?? ""} placeholder="e.g. Titan Grey" />
          </Field>

          <Field label="Ownership" htmlFor="ownership">
            <Select id="ownership" name="ownership" defaultValue={values.ownership ?? 1}>
              {OWNERSHIP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Registration state" htmlFor="registrationState">
            <Select id="registrationState" name="registrationState" defaultValue={values.registrationState ?? ""}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>

          <Field label="RTO" htmlFor="rto">
            <Input id="rto" name="rto" defaultValue={values.rto ?? ""} placeholder="e.g. Ludhiana West" />
          </Field>
        </FormGrid>

        <div className="mt-5 border-t border-ink-100 pt-5">
          <p className="field-label mb-3">Compliance & validity</p>
          <FormGrid columns={3}>
            <Field label="Insurance status" htmlFor="insuranceStatus">
              <Select id="insuranceStatus" name="insuranceStatus" defaultValue={values.insuranceStatus ?? ""}>
                <option value="">Not specified</option>
                {INSURANCE_STATUSES.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Insurance valid till" htmlFor="insuranceValidTill">
              <Input id="insuranceValidTill" name="insuranceValidTill" type="date" defaultValue={toDateInput(values.insuranceValidTill)} />
            </Field>
            <Field label="Fitness valid till" htmlFor="fitnessValidTill">
              <Input id="fitnessValidTill" name="fitnessValidTill" type="date" defaultValue={toDateInput(values.fitnessValidTill)} />
            </Field>
            <Field label="PUC valid till" htmlFor="pucValidTill">
              <Input id="pucValidTill" name="pucValidTill" type="date" defaultValue={toDateInput(values.pucValidTill)} />
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      {/* ────────────────────────── PRICING ─────────────────────────── */}
      <FormSection
        title="Pricing"
        description="Public price, plus the private numbers only authorised roles can see."
        icon={<IndianRupee className="size-4" />}
      >
        <FormGrid columns={3}>
          <Field label="Selling price" required error={state.fieldErrors?.sellingPrice} htmlFor="sellingPrice">
            <Input
              id="sellingPrice"
              name="sellingPrice"
              type="number"
              inputMode="numeric"
              required
              min={1}
              prefix="₹"
              defaultValue={values.sellingPrice ?? ""}
              onChange={(e) => setSellingPrice(Number(e.target.value))}
              placeholder="1250000"
            />
          </Field>

          <Field label="Original / new car price" hint="Shows the customer their saving" htmlFor="originalPrice">
            <Input
              id="originalPrice"
              name="originalPrice"
              type="number"
              inputMode="numeric"
              prefix="₹"
              defaultValue={values.originalPrice ?? ""}
              placeholder="1520000"
            />
          </Field>

          <div className="flex items-end pb-1">
            <Checkbox
              name="negotiable"
              defaultChecked={values.negotiable ?? true}
              label="Price is negotiable"
              description="Shown on the public listing"
            />
          </div>
        </FormGrid>

        {canSeeCost ? (
          <PrivateBlock className="mt-5">
            <FormGrid columns={3}>
              <Field label="Purchase / acquisition cost" htmlFor="purchasePrice">
                <Input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  inputMode="numeric"
                  prefix="₹"
                  defaultValue={values.purchasePrice ?? ""}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  placeholder="1080000"
                />
              </Field>
              <Field label="Refurbishment spend" htmlFor="refurbishmentCost">
                <Input
                  id="refurbishmentCost"
                  name="refurbishmentCost"
                  type="number"
                  inputMode="numeric"
                  prefix="₹"
                  defaultValue={values.refurbishmentCost ?? 0}
                  onChange={(e) => setRefurb(Number(e.target.value))}
                  placeholder="25000"
                />
              </Field>
              <Field label="Minimum acceptable price" hint="Your walk-away number" htmlFor="minAcceptablePrice">
                <Input
                  id="minAcceptablePrice"
                  name="minAcceptablePrice"
                  type="number"
                  inputMode="numeric"
                  prefix="₹"
                  defaultValue={values.minAcceptablePrice ?? ""}
                  placeholder="1190000"
                />
              </Field>
            </FormGrid>

            {cost > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] bg-white px-4 py-3">
                <div>
                  <p className="field-label">Total cost</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-ink-900">{formatPrice(cost)}</p>
                </div>
                <div>
                  <p className="field-label">Projected profit</p>
                  <p
                    className={`mt-0.5 text-[14px] font-semibold ${profit >= 0 ? "text-success-700" : "text-danger-600"}`}
                  >
                    {formatPrice(profit)}
                  </p>
                </div>
                <div>
                  <p className="field-label">Margin</p>
                  <p
                    className={`mt-0.5 text-[14px] font-semibold ${profit >= 0 ? "text-success-700" : "text-danger-600"}`}
                  >
                    {marginPct}%
                  </p>
                </div>
              </div>
            )}
          </PrivateBlock>
        ) : (
          <div className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-ink-200 bg-ink-50 p-3.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <p className="text-[12.5px] leading-relaxed text-ink-500">
              Purchase cost, refurbishment spend and margin are hidden for your role. Existing
              values stay untouched when you save.
            </p>
          </div>
        )}
      </FormSection>

      {/* ───────────────────────── CONDITION ────────────────────────── */}
      <FormSection
        title="Condition report"
        description="Honest condition data builds trust and reduces wasted test drives."
        icon={<ClipboardCheck className="size-4" />}
      >
        <FormGrid columns={3}>
          <Field label="Overall rating" hint="0 to 5" htmlFor="conditionRating">
            <Input
              id="conditionRating"
              name="conditionRating"
              type="number"
              step="0.1"
              min={0}
              max={5}
              defaultValue={values.conditionRating ?? ""}
              placeholder="4.5"
            />
          </Field>
          <Field label="Service history" htmlFor="serviceHistory">
            <Select id="serviceHistory" name="serviceHistory" defaultValue={values.serviceHistory ?? ""}>
              <option value="">Not specified</option>
              {SERVICE_HISTORY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Repainted panels" htmlFor="repaintedPanels">
            <Input
              id="repaintedPanels"
              name="repaintedPanels"
              type="number"
              min={0}
              max={12}
              defaultValue={values.repaintedPanels ?? 0}
            />
          </Field>
          <Field label="Engine condition" htmlFor="engineCondition">
            <Input id="engineCondition" name="engineCondition" defaultValue={values.engineCondition ?? ""} placeholder="Excellent" />
          </Field>
          <Field label="Tyre condition" htmlFor="tyreCondition">
            <Input id="tyreCondition" name="tyreCondition" defaultValue={values.tyreCondition ?? ""} placeholder="Good (70%)" />
          </Field>
          <Field label="Battery condition" htmlFor="batteryCondition">
            <Input id="batteryCondition" name="batteryCondition" defaultValue={values.batteryCondition ?? ""} placeholder="Good" />
          </Field>
          <Field label="Interior condition" htmlFor="interiorCondition">
            <Input id="interiorCondition" name="interiorCondition" defaultValue={values.interiorCondition ?? ""} placeholder="Excellent" />
          </Field>
          <Field label="Exterior condition" htmlFor="exteriorCondition">
            <Input id="exteriorCondition" name="exteriorCondition" defaultValue={values.exteriorCondition ?? ""} placeholder="Good" />
          </Field>
          <Field label="Number of keys" htmlFor="numberOfKeys">
            <Input id="numberOfKeys" name="numberOfKeys" type="number" min={1} max={5} defaultValue={values.numberOfKeys ?? 1} />
          </Field>
        </FormGrid>

        <div className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox name="accidental" defaultChecked={values.accidental} label="Has accident history" />
          <Checkbox name="floodDamaged" defaultChecked={values.floodDamaged} label="Flood damaged" />
          <Checkbox name="serviceRecordsAvailable" defaultChecked={values.serviceRecordsAvailable ?? true} label="Service records available" />
          <Checkbox name="rcAvailable" defaultChecked={values.rcAvailable ?? true} label="RC available" />
          <Checkbox name="insuranceAvailable" defaultChecked={values.insuranceAvailable} label="Insurance available" />
        </div>
      </FormSection>

      {/* ────────────────────────── FEATURES ────────────────────────── */}
      <FormSection
        title="Features & equipment"
        description="Ticked features appear on the public listing and power customer filters."
        icon={<Sparkles className="size-4" />}
      >
        <div className="space-y-5">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="field-label mb-2.5">{group.group}</p>
              <div className="flex flex-wrap gap-2">
                {group.features.map((f) => (
                  <CheckChip
                    key={f.key}
                    name="features"
                    value={f.key}
                    label={f.label}
                    defaultChecked={selectedFeatures.includes(f.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-ink-100 pt-5">
          <Field
            label="Additional features"
            hint="Comma separated — e.g. Roof carrier, Dashcam, Ambient lighting"
            htmlFor="customFeatures"
          >
            <Input id="customFeatures" name="customFeatures" defaultValue={customFeatures.join(", ")} />
          </Field>
        </div>
      </FormSection>

      {/* ───────────────────────── PUBLISHING ───────────────────────── */}
      <FormSection
        title="Description & publishing"
        description="How this car appears on your website."
        icon={<Globe className="size-4" />}
      >
        <Field
          label="Public description"
          hint="Write like you would explain the car to a customer standing next to it."
          htmlFor="description"
        >
          <Textarea
            id="description"
            name="description"
            rows={5}
            defaultValue={values.description ?? ""}
            placeholder="Single-owner car with full service history. Original paint on all panels, tyres at roughly 70%…"
          />
        </Field>

        {canSeeCost && (
          <div className="mt-4">
            <Field
              label="Internal notes"
              hint="Never shown publicly. Visible to staff who can see cost."
              htmlFor="internalNotes"
            >
              <Textarea
                id="internalNotes"
                name="internalNotes"
                rows={3}
                defaultValue={values.internalNotes ?? ""}
                placeholder="Approved for an extra 3% discount to clear ageing stock."
              />
            </Field>
          </div>
        )}

        <div className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
          <Field label="Listing status" htmlFor="status">
            <Select id="status" name="status" defaultValue={values.status ?? "available"}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VEHICLE_STATUS_META[s as VehicleStatus].label} — {VEHICLE_STATUS_META[s as VehicleStatus].help}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Switch
              name="isFeatured"
              defaultChecked={values.isFeatured}
              label="Feature on homepage"
              description="Featured cars appear first on your public site."
            />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-info-50 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-info-600" />
          <p className="text-[12.5px] leading-relaxed text-info-700">
            Only <strong>Available</strong>, <strong>Reserved</strong> and <strong>Booked</strong>{" "}
            vehicles appear on your public website. Drafts stay private until you publish them.
          </p>
        </div>
      </FormSection>

      {/* ─────────────────────────── ACTIONS ────────────────────────── */}
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
