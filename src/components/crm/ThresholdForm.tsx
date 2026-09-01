"use client";

import { useActionState } from "react";
import { AlarmClock, Timer, Handshake, CarFront } from "lucide-react";
import { saveAttentionThresholds, type ThresholdState } from "@/app/actions/attention";
import { Field, Input, FormSection, FormGrid } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import type { AttentionSettings } from "@/lib/attention";

/**
 * The thresholds behind every alert.
 *
 * Written as plain numbers with units rather than a settings matrix, because a
 * dealer thinks "we answer within fifteen minutes", not "SLA tier 1 = 900s".
 */
export function ThresholdForm({ values }: { values: AttentionSettings }) {
  const [state, formAction] = useActionState<ThresholdState, FormData>(
    saveAttentionThresholds,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="space-y-5 pb-32 lg:pb-5">
      {state.status === "success" && <Alert tone="success" title="Saved">{state.message}</Alert>}
      {state.status === "error" && (
        <Alert tone="error" title="Check these numbers">{state.message}</Alert>
      )}

      <FormSection
        title="How fast you answer an enquiry"
        description="Your response promise. It drives the action centre, the response queue and the escalation alerts together."
        icon={<AlarmClock className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Needs attention after" hint="Minutes since the enquiry arrived">
            <Input name="slaAttentionMinutes" type="number" min={1} defaultValue={values.attention} suffix="min" />
          </Field>
          <Field label="High priority after">
            <Input name="slaHighMinutes" type="number" min={1} defaultValue={values.high} suffix="min" />
          </Field>
          <Field label="Critical after" hint="The owner is alerted alongside the salesperson">
            <Input name="slaCriticalMinutes" type="number" min={1} defaultValue={values.critical} suffix="min" />
          </Field>
          <Field label="Escalate to management after">
            <Input name="slaEscalationMinutes" type="number" min={1} defaultValue={values.escalation} suffix="min" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="When stock has sat too long"
        description="Ageing is the quietest cost in a used-car yard. These marks decide when it gets raised."
        icon={<Timer className="size-4" />}
      >
        <FormGrid columns={3}>
          <Field label="First ageing warning">
            <Input name="ageingWarnDays" type="number" min={7} defaultValue={values.ageingWarnDays} suffix="days" />
          </Field>
          <Field label="Critical ageing">
            <Input name="ageingCriticalDays" type="number" min={8} defaultValue={values.ageingCriticalDays} suffix="days" />
          </Field>
          <Field label="Flag a car with no enquiries after" hint="Newly listed cars are never flagged">
            <Input name="zeroEnquiryDays" type="number" min={1} defaultValue={values.zeroEnquiryDays} suffix="days" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="When a lead goes quiet"
        description="Days without any activity before a live opportunity is treated as cooling off."
        icon={<CarFront className="size-4" />}
      >
        <FormGrid columns={3}>
          <Field label="Warm after">
            <Input name="leadWarmDays" type="number" min={1} defaultValue={values.leadWarmDays} suffix="days" />
          </Field>
          <Field label="Cold after">
            <Input name="leadColdDays" type="number" min={2} defaultValue={values.leadColdDays} suffix="days" />
          </Field>
          <Field label="Stuck in one stage after">
            <Input name="stageStallDays" type="number" min={1} defaultValue={values.stageStallDays} suffix="days" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Bookings and test drives"
        icon={<Handshake className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="A booking is at risk after" hint="The car is off the market the whole time">
            <Input name="bookingExpiryDays" type="number" min={1} defaultValue={values.bookingExpiryDays} suffix="days" />
          </Field>
          <Field label="A test drive is 'starting soon' within">
            <Input name="testDriveSoonMinutes" type="number" min={15} defaultValue={values.testDriveSoonMinutes} suffix="min" />
          </Field>
        </FormGrid>
      </FormSection>

      <div className="above-tabbar safe-bottom fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,24,40,0.06)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <SubmitButton size="lg" className="flex-1 lg:flex-none lg:px-8" pendingLabel="Saving…">
          Save thresholds
        </SubmitButton>
      </div>
    </form>
  );
}
