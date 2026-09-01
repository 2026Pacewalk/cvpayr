"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check, Share2, Copy, MessageCircle, X, Sparkles, Loader2, ExternalLink,
} from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Overlay";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { VehicleImage } from "@/components/VehicleImage";
import { createSharedCatalog } from "@/app/actions/leads";
import { formatPrice, formatKm, cn, whatsappHref } from "@/lib/utils";
import { VEHICLE_STATUS_META, type VehicleStatus } from "@/lib/constants";

export type MatchRow = {
  id: string;
  stockId: string;
  title: string;
  variant: string | null;
  sellingPrice: number;
  minAcceptablePrice: number | null;
  kmDriven: number;
  fuelType: string;
  transmission: string;
  bodyType: string;
  year: number;
  status: string;
  branchName: string;
  imageUrl: string | null;
  days: number;
};

/**
 * The salesperson picks cars while talking to the customer, then sends a single
 * link. Selection lives in component state; the link is created server-side so
 * it survives the call.
 */
export function QuickMatch({
  rows,
  dealerSlug,
  canShare,
  showMinPrice,
}: {
  rows: MatchRow[];
  dealerSlug: string | null;
  canShare: boolean;
  showMinPrice: boolean;
}) {
  const toast = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [result, setResult] = React.useState<{ url: string; code: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const picked = rows.filter((r) => selected.includes(r.id));
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Sparkles className="size-6" />}
        title="No cars match those requirements"
        description="Widen the budget or drop a filter — then share what you do have."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const isSelected = selected.includes(row.id);
          const status = VEHICLE_STATUS_META[row.status as VehicleStatus];
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => toggle(row.id)}
              aria-pressed={isSelected}
              className={cn(
                "group flex gap-3 rounded-[12px] border bg-white p-3 text-left transition-all",
                isSelected
                  ? "border-brand-500 ring-2 ring-brand-500/20"
                  : "border-ink-200 hover:border-ink-300 hover:shadow-sm",
              )}
            >
              <div className="relative size-[76px] shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
                <VehicleImage src={row.imageUrl} alt="" className="size-full" />
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-brand-600/80">
                    <Check className="size-6 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10.5px] text-ink-400">{row.stockId}</p>
                    <p className="line-clamp-1 text-[13.5px] font-semibold text-ink-950">
                      {row.title}
                    </p>
                    {row.variant && (
                      <p className="line-clamp-1 text-[11.5px] text-ink-500">{row.variant}</p>
                    )}
                  </div>
                  {row.status !== "available" && (
                    <Badge tone={status.tone} size="sm">{status.label}</Badge>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-500">
                  {formatKm(row.kmDriven)} · {row.fuelType} · {row.transmission} · {row.branchName}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="font-display text-[15px] font-semibold text-ink-950">
                    {formatPrice(row.sellingPrice)}
                  </span>
                  {showMinPrice && row.minAcceptablePrice && (
                    <span className="rounded bg-warning-50 px-1.5 py-0.5 text-[10.5px] font-medium text-warning-700">
                      floor {formatPrice(row.minAcceptablePrice)}
                    </span>
                  )}
                  {row.days > 60 && (
                    <Badge tone="warning" size="sm">{row.days}d old</Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selection tray */}
      {selected.length > 0 && (
        <div className="safe-bottom animate-slide-up fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(16,24,40,0.08)] backdrop-blur lg:bottom-4 lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2 lg:rounded-[14px] lg:border">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink-950">
                {selected.length} car{selected.length === 1 ? "" : "s"} shortlisted
              </p>
              <p className="truncate text-[12px] text-ink-500">
                {picked.map((p) => p.title).join(" · ")}
              </p>
            </div>
            <button
              onClick={() => setSelected([])}
              aria-label="Clear selection"
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-ink-400 hover:bg-ink-100"
            >
              <X className="size-4" />
            </button>
            {canShare && (
              <Button onClick={() => setShareOpen(true)} className="shrink-0">
                <Share2 className="size-4" />
                Share
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Share sheet */}
      <Sheet
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setResult(null);
        }}
        title={result ? "Shortlist ready" : "Share this shortlist"}
        description={
          result
            ? "Send the link to your customer."
            : `${selected.length} vehicles will be shown on a single page.`
        }
        size="md"
      >
        {result ? (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-ink-200 bg-ink-50 p-3">
              <p className="font-mono text-[12px] break-all text-ink-700">
                {origin}
                {result.url}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => copy(`${origin}${result.url}`)}>
                <Copy className="size-4" />
                Copy link
              </Button>
              <a
                href={whatsappHref(
                  "",
                  `Here are the cars I shortlisted for you:\n${origin}${result.url}`,
                ).replace("https://wa.me/?", "https://wa.me/?")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-success-600 text-[14px] font-medium text-white hover:bg-success-700"
              >
                <MessageCircle className="size-4" />
                Send on WhatsApp
              </a>
            </div>
            <Link
              href={result.url}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Preview the page
            </Link>
          </div>
        ) : (
          <form
            action={(fd) =>
              startTransition(async () => {
                const notes: Record<string, string> = {};
                for (const p of picked) {
                  const note = String(fd.get(`note_${p.id}`) ?? "").trim();
                  if (note) notes[p.id] = note;
                }
                const res = await createSharedCatalog({
                  title: String(fd.get("title") ?? "Cars picked for you"),
                  subtitle: String(fd.get("subtitle") ?? "") || undefined,
                  vehicleIds: selected,
                  customerName: String(fd.get("customerName") ?? "") || undefined,
                  customerPhone: String(fd.get("customerPhone") ?? "") || undefined,
                  notes,
                });
                if (res.status === "success") {
                  setResult({ url: res.url, code: res.code });
                  toast.success("Shortlist link created");
                } else {
                  toast.error(res.message ?? "Could not create the link");
                }
              })
            }
            className="space-y-4"
          >
            <Field label="Title" required>
              <Input name="title" required defaultValue="Cars picked for you" />
            </Field>
            <Field label="Subtitle" hint="A line of context for the customer">
              <Input
                name="subtitle"
                defaultValue="Based on what you told us — automatic, under budget, low kilometres."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer name" hint="Personalises the page">
                <Input name="customerName" placeholder="e.g. Rahul" />
              </Field>
              <Field label="Customer mobile" hint="Links this to their CRM record">
                <Input name="customerPhone" prefix="+91" inputMode="numeric" />
              </Field>
            </div>

            <div>
              <p className="field-label mb-2">Add a note to any car</p>
              <div className="space-y-2.5">
                {picked.map((p) => (
                  <div key={p.id} className="rounded-[10px] border border-ink-200 p-3">
                    <p className="text-[13px] font-medium text-ink-900">{p.title}</p>
                    <p className="text-[11.5px] text-ink-400">
                      {p.stockId} · {formatPrice(p.sellingPrice)}
                    </p>
                    <Textarea
                      name={`note_${p.id}`}
                      rows={2}
                      className="mt-2"
                      placeholder="Best value of the three — single owner and full service history."
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShareOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Create link
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
