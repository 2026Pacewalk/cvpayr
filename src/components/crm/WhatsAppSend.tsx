"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone, Send, Loader2, Pencil, Check } from "lucide-react";
import { Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/primitives";
import { getLeadSendContext, logOutreach, type SendContext } from "@/app/actions/whatsapp";
import { whatsappHref, telHref, cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  vehicle: "Vehicle",
  lead: "Follow-up",
  booking: "Booking",
  general: "General",
};

/**
 * The WhatsApp workflow, reusable on any lead surface.
 *
 * Templates are rendered server-side against live lead data, so what the
 * salesperson previews is exactly what the customer receives. Opening WhatsApp
 * logs the touch on the lead timeline and stamps the first-response time.
 */
export function WhatsAppSend({
  leadId,
  size = "md",
  variant = "success",
  label = "WhatsApp",
  fullWidth,
  className,
}: {
  leadId: string;
  size?: "sm" | "md" | "lg";
  variant?: "success" | "outline" | "ghost";
  label?: string;
  fullWidth?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [ctx, setCtx] = React.useState<SendContext | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const load = async () => {
    setOpen(true);
    if (ctx) return;
    setLoading(true);
    const result = await getLeadSendContext(leadId);
    setCtx(result);
    setLoading(false);
    if (result?.templates.length) {
      const first = result.templates[0];
      setSelected(first.key);
      setDraft(result.rendered[first.key] ?? "");
    }
  };

  const pick = (key: string) => {
    setSelected(key);
    setDraft(ctx?.rendered[key] ?? "");
    setEditing(false);
  };

  const send = () => {
    if (!ctx?.phone || !draft.trim()) return;
    const template = ctx.templates.find((t) => t.key === selected);

    // Open WhatsApp first so the tap is inside the user gesture — some mobile
    // browsers block a window opened after an await.
    window.open(whatsappHref(ctx.phone, draft), "_blank", "noopener");

    startTransition(async () => {
      const res = await logOutreach({
        leadId,
        channel: "whatsapp",
        templateKey: template?.key,
        templateName: template?.name,
        preview: draft,
      });
      if (res.firstResponse) toast.success("First response recorded", "Response time captured for this lead.");
      else toast.success("Logged on the lead timeline");
      setOpen(false);
      router.refresh();
    });
  };

  const buttonClasses = cn(
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors",
    size === "sm" ? "h-9 px-3 text-[13px]" : size === "lg" ? "h-11 px-4 text-[14px]" : "h-10 px-3.5 text-[13.5px]",
    variant === "success"
      ? "bg-success-600 text-white hover:bg-success-700"
      : variant === "outline"
        ? "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
        : "text-success-600 hover:bg-success-50",
    fullWidth && "w-full",
    className,
  );

  return (
    <>
      <button type="button" onClick={load} className={buttonClasses}>
        <MessageCircle className="size-4" />
        {label}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Send on WhatsApp"
        description={ctx?.customerName ? `To ${ctx.customerName}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={!ctx?.phone || !draft.trim()} variant="success">
              <Send className="size-4" />
              Open WhatsApp
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-ink-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !ctx ? (
          <p className="py-8 text-center text-[13.5px] text-ink-500">
            Could not load this lead.
          </p>
        ) : !ctx.phone ? (
          <p className="py-8 text-center text-[13.5px] text-ink-500">
            This customer has no mobile number on file.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="field-label mb-2">Choose a message</p>
              <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {ctx.templates.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => pick(t.key)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      selected === t.key
                        ? "border-success-600 bg-success-50 text-success-700"
                        : "border-ink-200 text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {selected && (
                <div className="mt-2">
                  <Badge tone="neutral" size="sm">
                    {CATEGORY_LABEL[ctx.templates.find((t) => t.key === selected)?.category ?? "general"]}
                  </Badge>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="field-label">Preview</p>
                <button
                  onClick={() => setEditing((e) => !e)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
                >
                  {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
                  {editing ? "Done" : "Edit before sending"}
                </button>
              </div>

              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full rounded-[12px] border border-ink-200 p-3.5 text-[13.5px] leading-relaxed focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none"
                />
              ) : (
                // Styled to read like the WhatsApp bubble it will become.
                <div className="rounded-[12px] rounded-tr-[4px] bg-[#dcf8c6] p-3.5">
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-900">
                    {draft}
                  </p>
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-ink-400">
                {draft.length} characters · sending to +91 {ctx.phone}
              </p>
            </div>

            <p className="rounded-[10px] bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-500">
              Opening WhatsApp records this on the lead timeline and, if it is the first
              outbound touch, stamps the response time.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Dialler shortcut that logs the call attempt against the lead. */
export function CallButton({
  leadId,
  phone,
  size = "md",
  label = "Call",
  fullWidth,
  className,
  onAfterCall,
}: {
  leadId: string;
  phone: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  fullWidth?: boolean;
  className?: string;
  /** Fires once the dialler has been opened — used to prompt for the outcome. */
  onAfterCall?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  return (
    <a
      href={telHref(phone)}
      onClick={() => {
        onAfterCall?.();
        startTransition(async () => {
          await logOutreach({ leadId, channel: "call" });
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink-900 font-medium text-white transition-colors hover:bg-ink-800",
        size === "sm" ? "h-9 px-3 text-[13px]" : size === "lg" ? "h-11 px-4 text-[14px]" : "h-10 px-3.5 text-[13.5px]",
        fullWidth && "w-full",
        className,
      )}
    >
      <Phone className="size-4" />
      {label}
    </a>
  );
}
