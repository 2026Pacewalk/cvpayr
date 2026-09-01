"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MessageCircle, Plus, Pencil, RotateCcw, Trash2, Power, Info,
} from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Sheet, ConfirmDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { saveTemplate, resetTemplate, deleteTemplate } from "@/app/actions/whatsapp";
import {
  TEMPLATE_VARIABLES, renderTemplate, usedVariables, TEMPLATE_SOFT_LIMIT,
} from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export type TemplateRow = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
  isActive: boolean;
  isSystem: boolean;
  useCount: number;
};

const CATEGORIES = [
  { value: "lead", label: "Follow-up" },
  { value: "vehicle", label: "Vehicle" },
  { value: "booking", label: "Booking" },
  { value: "general", label: "General" },
];

const CATEGORY_TONE: Record<string, "brand" | "purple" | "success" | "neutral"> = {
  lead: "brand",
  vehicle: "purple",
  booking: "success",
  general: "neutral",
};

/** Example values used for the live preview, so the dealer sees a real message. */
const SAMPLE = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.example]),
) as Record<string, string>;

export function TemplateManager({
  templates,
  canManage,
}: {
  templates: TemplateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<TemplateRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<TemplateRow | null>(null);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Done");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not complete");
      }
    });

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            New template
          </Button>
        </div>
      )}

      {templates.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className={t.isActive ? "" : "opacity-70"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14.5px] font-semibold text-ink-950">{t.name}</h3>
                    <Badge tone={CATEGORY_TONE[t.category] ?? "neutral"} size="sm">
                      {CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
                    </Badge>
                    {!t.isActive && <Badge tone="neutral" size="sm">Off</Badge>}
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-400">
                    {t.useCount > 0 ? `Sent ${t.useCount} time${t.useCount === 1 ? "" : "s"}` : "Not used yet"}
                    {t.isSystem && " · built-in"}
                  </p>
                </div>

                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditing(t)}
                      aria-label={`Edit ${t.name}`}
                      className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    >
                      <Pencil className="size-4" />
                    </button>
                    {t.isSystem ? (
                      <button
                        onClick={() => run(() => resetTemplate(t.id))}
                        disabled={pending}
                        aria-label={`Reset ${t.name}`}
                        title="Reset to the default wording"
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete ${t.name}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-[10px] rounded-tr-[4px] bg-[#dcf8c6] p-3">
                <p className="line-clamp-4 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-800">
                  {renderTemplate(t.body, SAMPLE)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<MessageCircle className="size-6" />}
          title="No templates yet"
          description="Templates load the first time someone opens a WhatsApp action on a lead."
        />
      )}

      {editing && canManage && (
        <TemplateSheet
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        loading={pending}
        title="Delete this template?"
        confirmLabel="Delete"
        message={deleting ? `“${deleting.name}” will be removed from the WhatsApp menu.` : ""}
        onConfirm={() => deleting && run(() => deleteTemplate(deleting.id))}
      />
    </>
  );
}

function TemplateSheet({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [body, setBody] = React.useState(template?.body ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // Put the caret after the token the dealer just inserted.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preview = renderTemplate(body, SAMPLE);
  const unknown = usedVariables(body).filter(
    (v) => !TEMPLATE_VARIABLES.some((t) => t.key === v),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={template ? `Edit “${template.name}”` : "New WhatsApp template"}
      description="Placeholders are replaced with real customer and vehicle data when sent."
      size="lg"
    >
      <form
        action={(fd) => {
          setError(null);
          fd.set("body", body);
          startTransition(async () => {
            const res = await saveTemplate(template?.id ?? null, fd);
            if (res.status === "success") {
              toast.success(res.message ?? "Saved");
              onSaved();
            } else {
              setError(res.message ?? "Could not save");
            }
          });
        }}
        className="space-y-5"
      >
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name" required>
            <Input name="name" required defaultValue={template?.name} placeholder="Send vehicle details" />
          </Field>
          <Field label="Category" hint="Controls where it appears">
            <Select name="category" defaultValue={template?.category ?? "lead"}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <p className="field-label mb-2">Insert a placeholder</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insert(v.key)}
                title={v.label}
                className="rounded-full border border-ink-200 px-2.5 py-1 font-mono text-[11.5px] text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {v.key}
              </button>
            ))}
          </div>
        </div>

        <Field label="Message" required>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            required
            className={cn(
              "w-full rounded-[10px] border px-3 py-2.5 text-[13.5px] leading-relaxed focus:ring-4 focus:ring-brand-500/10 focus:outline-none",
              body.length > TEMPLATE_SOFT_LIMIT
                ? "border-warning-300 focus:border-warning-500"
                : "border-ink-200 focus:border-brand-500",
            )}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className={body.length > TEMPLATE_SOFT_LIMIT ? "text-warning-700" : "text-ink-400"}>
            {body.length} characters
            {body.length > TEMPLATE_SOFT_LIMIT && " — long messages get truncated in the WhatsApp preview"}
          </span>
          {unknown.length > 0 && (
            <span className="text-danger-600">
              Unknown placeholder{unknown.length > 1 ? "s" : ""}: {unknown.join(", ")}
            </span>
          )}
        </div>

        <div>
          <p className="field-label mb-2">Preview with sample data</p>
          <div className="rounded-[12px] rounded-tr-[4px] bg-[#dcf8c6] p-3.5">
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-900">
              {preview || "Your message will appear here."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-[10px] bg-info-50 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-info-600" />
          <p className="text-[12.5px] leading-relaxed text-info-700">
            A placeholder with no data available is removed rather than left as{" "}
            <code className="font-mono">{"{{…}}"}</code>, so a half-filled message never reaches a
            customer. Salespeople can still edit any message before sending.
          </p>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <Switch
            name="isActive"
            defaultChecked={template?.isActive ?? true}
            label="Available in the WhatsApp menu"
            description="Turn off to hide it without deleting the wording."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>
            {template ? "Save template" : "Create template"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
