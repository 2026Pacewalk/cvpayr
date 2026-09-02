"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, KeyRound, Send, Trash2, Plus, ShieldCheck, Webhook, Copy } from "lucide-react";
import {
  saveSmsSettings, saveSmsTemplate, deleteSmsTemplate, sendTestSms, rotateDlrSecret,
  type SmsActionState,
} from "@/app/actions/sms";
import { Field, Input, Textarea, Switch, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Alert, useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/primitives";
import { SMS_VARIABLES, smsSegments, smsPlaceholders } from "@/lib/sms";
import { cn } from "@/lib/utils";

export type SmsTemplateRow = {
  id: string;
  key: string;
  name: string;
  body: string;
  dltTemplateId: string | null;
  isActive: boolean;
  useCount: number;
};

export function SmsSettingsForm({
  status,
  templates,
  dealerName,
}: {
  status: {
    configured: boolean;
    active: boolean;
    username: string | null;
    senderId: string | null;
    ivrNumber: string | null;
    hasPassword: boolean;
    dlrUrl: string | null;
  };
  templates: SmsTemplateRow[];
  dealerName: string;
}) {
  const [state, formAction] = useActionState<SmsActionState, FormData>(saveSmsSettings, {
    status: "idle",
  });

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        {state.status === "success" && (
          <Alert tone="success" title="Saved">{state.message}</Alert>
        )}
        {state.status === "error" && state.message && (
          <Alert tone="error" title="Could not save">{state.message}</Alert>
        )}

        <FormSection
          title="Gateway account"
          description="Your own SmartPing account and DLT-approved sender ID. These belong to your dealership, not to CarVyapar."
          icon={<KeyRound className="size-4" />}
        >
          <FormGrid columns={2}>
            <Field label="Username" required error={state.fieldErrors?.username}>
              <Input
                name="username"
                defaultValue={status.username ?? ""}
                placeholder="YOURDEALER.trans"
                autoComplete="off"
              />
            </Field>

            <Field
              label="Password"
              required={!status.hasPassword}
              hint={
                status.hasPassword
                  ? "A password is stored. Leave blank to keep it."
                  : "Stored on the server and never shown again."
              }
              error={state.fieldErrors?.password}
            >
              <Input
                name="password"
                type="password"
                placeholder={status.hasPassword ? "••••••••" : "Gateway password"}
                autoComplete="new-password"
              />
            </Field>

            <Field
              label="Sender ID"
              required
              hint="Exactly six characters, as approved on DLT"
              error={state.fieldErrors?.senderId}
            >
              <Input
                name="senderId"
                defaultValue={status.senderId ?? ""}
                placeholder="BRKLEY"
                maxLength={6}
                className="uppercase"
                autoComplete="off"
              />
            </Field>

            <Field label="IVR number" hint="Fills the {#cbn#} placeholder in your templates">
              <Input
                name="ivrNumber"
                defaultValue={status.ivrNumber ?? ""}
                placeholder="1800 200 1234"
              />
            </Field>
          </FormGrid>

          <div className="mt-5 rounded-[10px] border border-ink-200 p-3.5">
            <Switch
              name="isActive"
              defaultChecked={status.active}
              label="Send messages"
              description="While this is off nothing is sent, even where the app would otherwise message a customer."
            />
          </div>
        </FormSection>

        <SubmitButton size="lg" pendingLabel="Saving…">Save SMS settings</SubmitButton>
      </form>

      <DeliveryReports dlrUrl={status.dlrUrl} />

      <TemplateEditor templates={templates} canTest={status.configured} dealerName={dealerName} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TemplateEditor({
  templates,
  canTest,
  dealerName,
}: {
  templates: SmsTemplateRow[];
  canTest: boolean;
  dealerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<SmsTemplateRow | null>(null);

  const blank: SmsTemplateRow = {
    id: "",
    key: "",
    name: "",
    body: "",
    dltTemplateId: null,
    isActive: true,
    useCount: 0,
  };

  return (
    <FormSection
      title="Message templates"
      description="Indian operators only deliver text that matches a template you registered on DLT, character for character. Paste the approved wording exactly."
      icon={<MessageSquare className="size-4" />}
    >
      <div className="space-y-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            canTest={canTest}
            dealerName={dealerName}
            onEdit={() => setDraft(t)}
          />
        ))}

        {draft ? (
          <TemplateForm
            template={draft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              setDraft(null);
              router.refresh();
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setDraft(blank)} disabled={pending}>
            <Plus className="size-4" />
            Add a template
          </Button>
        )}
      </div>

      <div className="mt-5 rounded-[10px] border border-brand-200 bg-brand-50/50 p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
          <ShieldCheck className="size-4 text-brand-600" />
          Placeholders
        </p>
        <ul className="mt-2 space-y-1">
          {SMS_VARIABLES.map((v) => (
            <li key={v.key} className="text-[12.5px] text-ink-600">
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11.5px] text-brand-700">
                {`{#${v.key}#}`}
              </code>{" "}
              — {v.label}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-500">
          A message with an unfilled placeholder is never sent. The operator drops anything whose
          text no longer matches the registered template, so it would cost you money and deliver
          nothing.
        </p>
      </div>
    </FormSection>
  );
}

function TemplateCard({
  template,
  canTest,
  dealerName,
  onEdit,
}: {
  template: SmsTemplateRow;
  canTest: boolean;
  dealerName: string;
  onEdit: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const preview = template.body.replace(/\{#var#\}/g, dealerName);
  const seg = smsSegments(preview);

  return (
    <div className="rounded-[12px] border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-ink-950">{template.name}</p>
            <code className="font-mono text-[11px] text-ink-400">{template.key}</code>
            {!template.isActive && <Badge tone="neutral" size="sm">Off</Badge>}
            {template.dltTemplateId && (
              <Badge tone="success" size="sm">DLT {template.dltTemplateId}</Badge>
            )}
          </div>
          <p className="mt-2 rounded-[8px] bg-ink-50 p-3 text-[12.5px] leading-relaxed text-ink-700">
            {template.body}
          </p>
          <p className="mt-2 text-[11.5px] text-ink-400">
            {seg.characters} characters · {seg.segments} segment
            {seg.segments === 1 ? "" : "s"} · {seg.encoding}
            {seg.encoding === "Unicode" && " — costs more per message"}
            {template.useCount > 0 && ` · sent ${template.useCount}×`}
          </p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            disabled={!canTest}
            title={canTest ? "Send to your own mobile" : "Add gateway credentials first"}
            onClick={() =>
              startTransition(async () => {
                const res = await sendTestSms(template.key);
                if (res.status === "success") toast.success(res.message);
                else toast.error(res.message);
                router.refresh();
              })
            }
          >
            <Send className="size-3.5" />
            Test
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateForm({
  template,
  onCancel,
  onSaved,
}: {
  template: SmsTemplateRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [key, setKey] = React.useState(template.key);
  const [name, setName] = React.useState(template.name);
  const [body, setBody] = React.useState(template.body);
  const [dlt, setDlt] = React.useState(template.dltTemplateId ?? "");

  const seg = smsSegments(body);
  const placeholders = smsPlaceholders(body);

  return (
    <div className="rounded-[12px] border-2 border-brand-300 bg-white p-4">
      <FormGrid columns={2}>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service — thank you" />
        </Field>
        <Field label="Key" required hint="Used when the app sends this automatically">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="service_thank_you"
            disabled={Boolean(template.id)}
          />
        </Field>
      </FormGrid>

      <div className="mt-4">
        <Field
          label="Message"
          required
          hint="Paste the DLT-approved wording exactly, including punctuation"
        >
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-400">
          <span>
            {seg.characters}/{seg.perSegment} · {seg.segments} segment
            {seg.segments === 1 ? "" : "s"} · {seg.encoding}
          </span>
          {placeholders.length > 0 && (
            <span className="text-brand-700">
              placeholders: {placeholders.map((p) => `{#${p}#}`).join(", ")}
            </span>
          )}
        </p>
      </div>

      <div className="mt-4">
        <Field label="DLT template ID" hint="Optional — kept for your audit trail">
          <Input value={dlt} onChange={(e) => setDlt(e.target.value)} placeholder="1207xxxxxxxxxxxxx" />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveSmsTemplate({
                id: template.id || undefined,
                key,
                name,
                body,
                dltTemplateId: dlt,
              });
              if (res.status === "success") {
                toast.success(res.message);
                onSaved();
              } else {
                toast.error(res.message);
              }
            })
          }
        >
          Save template
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        {template.id && (
          <Button
            variant="ghost"
            className="ml-auto"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteSmsTemplate(template.id);
                toast.success("Template deleted");
                onSaved();
              })
            }
          >
            <Trash2 className="size-4 text-danger-600" />
          </Button>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */

/**
 * The delivery-report webhook.
 *
 * Without it, "sent" only ever means the gateway accepted the message — which
 * is not what a dealer means when they ask whether a customer got it. Give this
 * URL to SmartPing as the DLR callback and the log starts showing what the
 * operator actually reported.
 */
function DeliveryReports({ dlrUrl }: { dlrUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <FormSection
      title="Delivery reports"
      description="Optional, and worth doing. Until this is set up, the log can only tell you the gateway accepted a message, not that it arrived."
      icon={<Webhook className="size-4" />}
    >
      {dlrUrl ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ink-200 bg-ink-50 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-700">
              {dlrUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(dlrUrl);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-500">
            Give this to SmartPing as your DLR callback URL. Treat it as a secret — anyone with
            it can mark your messages delivered.
          </p>
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await rotateDlrSecret();
                toast.success(res.message);
                router.refresh();
              })
            }
          >
            Generate a new URL
          </Button>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-[13px] text-ink-600">
            No callback URL yet. Generate one, then give it to SmartPing.
          </p>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await rotateDlrSecret();
                toast.success(res.message);
                router.refresh();
              })
            }
          >
            <Webhook className="size-4" />
            Generate the callback URL
          </Button>
        </div>
      )}
    </FormSection>
  );
}
