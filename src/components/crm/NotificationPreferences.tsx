"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Volume2, MonitorSmartphone, Mail, MessageCircle, Moon, ListFilter } from "lucide-react";
import {
  saveNotificationPreferences,
  setBrowserPush,
  type PreferenceState,
} from "@/app/actions/notifications";
import { Field, Select, Switch, Checkbox, FormSection, FormGrid } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/primitives";
import {
  CATEGORY_META,
  NOTIFICATION_PRIORITIES,
  PRIORITY_META,
  mutableTypesByCategory,
  type NotificationCategory,
} from "@/lib/notifications";

export type PreferenceValues = {
  browserPush: boolean;
  email: boolean;
  whatsapp: boolean;
  sound: boolean;
  digestEnabled: boolean;
  digestHour: number;
  quietStart: number | null;
  quietEnd: number | null;
  mutedTypes: string[];
  minPriority: string;
};

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`,
}));

export function NotificationPreferences({
  values,
  emailConfigured,
  whatsappConfigured,
}: {
  values: PreferenceValues;
  /** Whether a provider is actually wired up. Drives honest UI, not a fake toggle. */
  emailConfigured: boolean;
  whatsappConfigured: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<PreferenceState, FormData>(
    saveNotificationPreferences,
    { status: "idle" },
  );

  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [pushOn, setPushOn] = React.useState(values.browserPush);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const groups = React.useMemo(() => [...mutableTypesByCategory().entries()], []);

  const askPermission = async () => {
    if (permission === "unsupported") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    const granted = result === "granted";
    setPushOn(granted);
    await setBrowserPush(granted);
    if (granted) {
      new Notification("Alerts are on", {
        body: "This is what a CarVyapar alert looks like.",
        icon: "/favicon.ico",
      });
    }
    router.refresh();
  };

  return (
    <form action={formAction} className="space-y-5 pb-32 lg:pb-5">
      {state.status === "success" && (
        <Alert tone="success" title="Saved">{state.message}</Alert>
      )}
      {state.status === "error" && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection
        title="How you want to be told"
        description="The notification centre is always on. These control how loudly it reaches you."
        icon={<Bell className="size-4" />}
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-ink-200 p-3.5">
            <Switch
              name="sound"
              defaultChecked={values.sound}
              label={
                <span className="inline-flex items-center gap-2">
                  <Volume2 className="size-4 text-ink-400" />
                  Chime on a new alert
                </span>
              }
              description="A short tone when something arrives while the CRM is open."
            />
          </div>

          <div className="rounded-[10px] border border-ink-200 p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink-800">
                  <MonitorSmartphone className="size-4 text-ink-400" />
                  Browser notifications
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                  Alerts on your desktop or phone even when this tab is in the background.
                </p>

                {permission === "unsupported" && (
                  <p className="mt-2 text-[12px] text-ink-500">
                    This browser does not support them.
                  </p>
                )}
                {permission === "denied" && (
                  <p className="mt-2 text-[12px] text-danger-600">
                    Blocked in your browser settings. Allow notifications for this site, then
                    come back.
                  </p>
                )}
              </div>

              {permission === "granted" ? (
                <span className="shrink-0">
                  <Badge tone="success" dot>Allowed</Badge>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={permission === "unsupported" || permission === "denied"}
                  onClick={askPermission}
                  className="shrink-0"
                >
                  Turn on
                </Button>
              )}
            </div>
            <input type="hidden" name="browserPush" value={pushOn ? "on" : "off"} />
          </div>

          {/*
            Email and WhatsApp are shown, but a toggle only becomes usable once a
            provider is actually configured. Promising delivery we cannot make is
            worse than saying plainly that it is not connected yet.
          */}
          <div className="rounded-[10px] border border-ink-200 p-3.5">
            <Switch
              name="email"
              defaultChecked={values.email && emailConfigured}
              disabled={!emailConfigured}
              label={
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-4 text-ink-400" />
                  Email
                  {!emailConfigured && (
                    <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                      Not connected
                    </span>
                  )}
                </span>
              }
              description={
                emailConfigured
                  ? "A copy of high and critical alerts by email."
                  : "No email provider is configured for this installation yet. Nothing is sent."
              }
            />
          </div>

          <div className="rounded-[10px] border border-ink-200 p-3.5">
            <Switch
              name="whatsapp"
              defaultChecked={values.whatsapp && whatsappConfigured}
              disabled={!whatsappConfigured}
              label={
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="size-4 text-ink-400" />
                  WhatsApp
                  {!whatsappConfigured && (
                    <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                      Not connected
                    </span>
                  )}
                </span>
              }
              description={
                whatsappConfigured
                  ? "Critical alerts to your WhatsApp number."
                  : "Needs an approved WhatsApp Business API account. Sending stays off until one is connected."
              }
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Your daily plan"
        description="One summary each morning of what is due and what is late."
        icon={<ListFilter className="size-4" />}
      >
        <div className="space-y-4">
          <Switch
            name="digestEnabled"
            defaultChecked={values.digestEnabled}
            label="Send me a daily plan"
            description="Skipped entirely on days when you have nothing due."
          />
          <FormGrid columns={2}>
            <Field label="Send it at">
              <Select name="digestHour" defaultValue={values.digestHour}>
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      <FormSection
        title="Quiet hours"
        description="Sounds and browser alerts are held back. Critical alerts still come through — a lapsing booking is worth the interruption."
        icon={<Moon className="size-4" />}
      >
        <FormGrid columns={2}>
          <Field label="Quiet from" hint="Leave blank for no quiet hours">
            <Select name="quietStart" defaultValue={values.quietStart ?? ""}>
              <option value="">No quiet hours</option>
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quiet until">
            <Select name="quietEnd" defaultValue={values.quietEnd ?? ""}>
              <option value="">No quiet hours</option>
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </Select>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="What reaches you"
        description="Turn off the ones you do not act on. Anything that costs money if missed cannot be silenced."
        icon={<ListFilter className="size-4" />}
      >
        <Field
          label="Minimum importance"
          hint="Anything below this is not written to your inbox at all"
          className="mb-5"
        >
          <Select name="minPriority" defaultValue={values.minPriority}>
            {NOTIFICATION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label} and above — {PRIORITY_META[p].help}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-5">
          {groups.map(([category, types]) => (
            <div key={category}>
              <p className="field-label mb-2.5">
                {CATEGORY_META[category as NotificationCategory]?.label ?? category}
              </p>
              <div className="space-y-3">
                {types.map(({ type, meta }) => (
                  <Checkbox
                    key={type}
                    name="mutedTypes"
                    value={type}
                    defaultChecked={values.mutedTypes.includes(type)}
                    label={<span className="font-medium">Mute: {meta.label}</span>}
                    description={meta.description}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      <div className="above-tabbar safe-bottom fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,24,40,0.06)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <SubmitButton size="lg" className="flex-1 lg:flex-none lg:px-8" pendingLabel="Saving…">
          Save preferences
        </SubmitButton>
      </div>
    </form>
  );
}
