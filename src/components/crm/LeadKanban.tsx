"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, GripVertical, Clock3, ChevronRight } from "lucide-react";
import { Badge, Avatar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { updateLeadStage } from "@/app/actions/leads";
import {
  PIPELINE_STAGES, LEAD_STAGE_META, LOST_REASONS, type LeadStage,
} from "@/lib/constants";
import { formatPrice, relativeTime, telHref, whatsappHref, cn, formatDate } from "@/lib/utils";
import type { LeadRow } from "./LeadTable";

/**
 * Kanban pipeline.
 * Desktop supports drag and drop between columns; on touch devices each card
 * exposes a "move" control instead, because dragging inside a horizontally
 * scrolling board is miserable on a phone.
 */
export function LeadKanban({
  rows,
  canManage,
}: {
  rows: LeadRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  const [moveLead, setMoveLead] = React.useState<LeadRow | null>(null);
  const [lostLead, setLostLead] = React.useState<{ lead: LeadRow; stage: string } | null>(null);
  const [, startTransition] = React.useTransition();

  const byStage = React.useMemo(() => {
    const map = new Map<string, LeadRow[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage, []);
    for (const row of rows) {
      if (!map.has(row.stage)) map.set(row.stage, []);
      map.get(row.stage)!.push(row);
    }
    return map;
  }, [rows]);

  const commitMove = (lead: LeadRow, stage: string) => {
    if (lead.stage === stage) return;
    if (stage === "lost") {
      setLostLead({ lead, stage });
      return;
    }
    startTransition(async () => {
      await updateLeadStage(lead.id, stage);
      toast.success(`${lead.customerName} → ${LEAD_STAGE_META[stage as LeadStage].label}`);
      router.refresh();
    });
  };

  return (
    <>
      <div className="thin-scrollbar -mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        <div className="flex min-h-[60vh] gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const meta = LEAD_STAGE_META[stage];
            const items = byStage.get(stage) ?? [];
            const value = items.reduce((s, i) => s + (i.vehiclePrice ?? 0), 0);

            return (
              <section
                key={stage}
                onDragOver={(e) => {
                  if (!canManage || !dragging) return;
                  e.preventDefault();
                  setOverStage(stage);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const lead = rows.find((r) => r.id === dragging);
                  if (lead) commitMove(lead, stage);
                  setDragging(null);
                  setOverStage(null);
                }}
                className={cn(
                  "flex w-[268px] shrink-0 flex-col rounded-[14px] border bg-ink-50/70 transition-colors",
                  overStage === stage ? "border-brand-400 bg-brand-50/60" : "border-ink-200",
                )}
              >
                <header className="flex items-center justify-between gap-2 border-b border-ink-200/70 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("size-2 rounded-full", {
                        "bg-info-600": meta.tone === "info",
                        "bg-brand-500": meta.tone === "brand",
                        "bg-purple-600": meta.tone === "purple",
                        "bg-warning-600": meta.tone === "warning",
                        "bg-success-600": meta.tone === "success",
                        "bg-danger-600": meta.tone === "danger",
                        "bg-ink-400": meta.tone === "neutral",
                      })}
                    />
                    <h2 className="text-[12.5px] font-semibold text-ink-800">{meta.short}</h2>
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-500 tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  {value > 0 && (
                    <span className="text-[10.5px] text-ink-400 tabular-nums">
                      {formatPrice(value)}
                    </span>
                  )}
                </header>

                <div className="thin-scrollbar flex-1 space-y-2 overflow-y-auto p-2">
                  {items.length === 0 && (
                    <p className="px-2 py-6 text-center text-[12px] text-ink-400">No leads</p>
                  )}
                  {items.map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      canManage={canManage}
                      dragging={dragging === lead.id}
                      onDragStart={() => setDragging(lead.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOverStage(null);
                      }}
                      onMove={() => setMoveLead(lead)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Mobile / accessible stage picker */}
      {moveLead && (
        <Sheet
          open
          onClose={() => setMoveLead(null)}
          title="Move to stage"
          description={moveLead.customerName}
          size="sm"
        >
          <div className="space-y-1.5">
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage}
                onClick={() => {
                  const lead = moveLead;
                  setMoveLead(null);
                  commitMove(lead, stage);
                }}
                disabled={stage === moveLead.stage}
                className={cn(
                  "flex w-full items-center justify-between rounded-[10px] border px-3.5 py-3 text-left text-[13.5px] font-medium transition-colors",
                  stage === moveLead.stage
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-ink-200 text-ink-700 hover:bg-ink-50",
                )}
              >
                {LEAD_STAGE_META[stage].label}
                {stage === moveLead.stage ? (
                  <span className="text-[11.5px] text-brand-600">Current</span>
                ) : (
                  <ChevronRight className="size-4 text-ink-300" />
                )}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* Lost reason */}
      {lostLead && (
        <Sheet
          open
          onClose={() => setLostLead(null)}
          title="Why was this lead lost?"
          description={lostLead.lead.customerName}
          size="sm"
        >
          <form
            action={(formData) =>
              startTransition(async () => {
                await updateLeadStage(lostLead.lead.id, "lost", String(formData.get("reason")));
                toast.info("Lead marked lost");
                setLostLead(null);
                router.refresh();
              })
            }
            className="space-y-4"
          >
            <Field label="Reason" required>
              <Select name="reason" required defaultValue={LOST_REASONS[0]}>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLostLead(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger">Mark lost</Button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

function KanbanCard({
  lead,
  canManage,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: LeadRow;
  canManage: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: () => void;
}) {
  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();

  return (
    <article
      draggable={canManage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-[10px] border border-ink-200 bg-white p-3 shadow-xs transition-shadow hover:shadow-md",
        dragging && "opacity-40",
        canManage && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar name={lead.customerName} size="xs" className="mt-0.5" />
        <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink-950">{lead.customerName}</p>
          <p className="font-mono text-[10px] text-ink-400">{lead.reference}</p>
        </Link>
        {lead.priority === "high" && (
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-danger-600" title="High priority" />
        )}
        {canManage && (
          <button
            onClick={onMove}
            aria-label="Move to another stage"
            className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-[6px] text-ink-300 hover:bg-ink-100 hover:text-ink-600"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
      </div>

      {lead.vehicleLabel && (
        <p className="mt-2 line-clamp-1 text-[11.5px] text-ink-600">{lead.vehicleLabel}</p>
      )}
      {lead.vehiclePrice && (
        <p className="text-[11.5px] font-medium text-ink-800">{formatPrice(lead.vehiclePrice)}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.branchName && (
          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
            {lead.branchName.replace(" Showroom", "")}
          </span>
        )}
        {lead.ownerName ? (
          <span className="text-[10.5px] text-ink-400">{lead.ownerName.split(" ")[0]}</span>
        ) : (
          <Badge tone="warning" size="sm">Unassigned</Badge>
        )}
      </div>

      {lead.nextFollowUpAt && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-[10.5px]",
            overdue ? "font-medium text-danger-600" : "text-ink-400",
          )}
        >
          <Clock3 className="size-3" />
          {formatDate(lead.nextFollowUpAt)}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-ink-100 pt-2.5">
        <span className="text-[10.5px] text-ink-400">{relativeTime(lead.lastActivityAt)}</span>
        <div className="flex gap-1">
          <a
            href={telHref(lead.customerPhone)}
            aria-label="Call"
            className="flex size-7 items-center justify-center rounded-[6px] text-ink-500 hover:bg-ink-100"
          >
            <Phone className="size-3.5" />
          </a>
          <a
            href={whatsappHref(
              lead.customerPhone,
              `Hi ${lead.customerName.split(" ")[0]}, following up on your enquiry.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex size-7 items-center justify-center rounded-[6px] text-success-600 hover:bg-success-50"
          >
            <MessageCircle className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
