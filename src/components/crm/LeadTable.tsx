"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, MoreHorizontal, UserPlus, Eye, CalendarPlus, Clock3 } from "lucide-react";
import { TableShell, Th, Td, Tr } from "@/components/ui/Table";
import { Badge, Avatar } from "@/components/ui/primitives";
import { Popover, MenuItem, Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { updateLeadStage, reassignLead, createFollowUp } from "@/app/actions/leads";
import {
  LEAD_STAGE_META, LEAD_SOURCE_LABELS, LEAD_PRIORITIES, LOST_REASONS,
  FOLLOW_UP_TYPES, PIPELINE_STAGES, type LeadStage,
} from "@/lib/constants";
import {
  formatPrice, relativeTime, telHref, whatsappHref, cn, formatDate, toDateTimeLocal,
} from "@/lib/utils";

export type LeadRow = {
  id: string;
  reference: string;
  stage: string;
  priority: string;
  source: string;
  createdAt: string;
  lastActivityAt: string;
  nextFollowUpAt: string | null;
  customerName: string;
  customerPhone: string;
  customerCity: string | null;
  vehicleLabel: string | null;
  vehiclePrice: number | null;
  branchName: string | null;
  ownerName: string | null;
  ownerId: string | null;
  requirement: string | null;
};

type Staff = { id: string; name: string };

export function LeadTable({
  rows,
  staff,
  canAssign,
  canManage,
}: {
  rows: LeadRow[];
  staff: Staff[];
  canAssign: boolean;
  canManage: boolean;
}) {
  const [followUpFor, setFollowUpFor] = React.useState<LeadRow | null>(null);
  const [lostFor, setLostFor] = React.useState<LeadRow | null>(null);

  return (
    <>
      <TableShell
        mobile={
          <>
            {rows.map((row) => (
              <LeadCard
                key={row.id}
                row={row}
                staff={staff}
                canAssign={canAssign}
                canManage={canManage}
                onFollowUp={() => setFollowUpFor(row)}
                onLost={() => setLostFor(row)}
              />
            ))}
          </>
        }
      >
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Interested in</Th>
            <Th>Branch</Th>
            <Th>Owner</Th>
            <Th>Source</Th>
            <Th>Next follow-up</Th>
            <Th>Stage</Th>
            <Th className="w-28" align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stage = LEAD_STAGE_META[row.stage as LeadStage];
            const priority = LEAD_PRIORITIES.find((p) => p.value === row.priority);
            const overdue = row.nextFollowUpAt && new Date(row.nextFollowUpAt) < new Date();
            return (
              <Tr key={row.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.customerName} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/leads/${row.id}`}
                          className="truncate font-medium text-ink-900 hover:text-brand-700"
                        >
                          {row.customerName}
                        </Link>
                        {priority && row.priority === "high" && (
                          <span className="size-1.5 shrink-0 rounded-full bg-danger-600" title="High priority" />
                        )}
                      </div>
                      <p className="text-[11.5px] text-ink-400">
                        <span className="font-mono">{row.reference}</span> · {row.customerPhone}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>
                  {row.vehicleLabel ? (
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-[12.5px] text-ink-700">{row.vehicleLabel}</p>
                      {row.vehiclePrice && (
                        <p className="text-[11.5px] text-ink-400">{formatPrice(row.vehiclePrice)}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[12.5px] text-ink-400">
                      {row.requirement ?? "General enquiry"}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px]">{row.branchName ?? "—"}</Td>
                <Td className="whitespace-nowrap text-[12.5px]">
                  {row.ownerName ?? <span className="text-warning-700">Unassigned</span>}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px]">
                  {LEAD_SOURCE_LABELS[row.source] ?? row.source}
                </Td>
                <Td className="whitespace-nowrap">
                  {row.nextFollowUpAt ? (
                    <span className={cn("text-[12.5px]", overdue ? "font-medium text-danger-600" : "text-ink-600")}>
                      {formatDate(row.nextFollowUpAt)}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-ink-300">—</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={telHref(row.customerPhone)}
                      aria-label={`Call ${row.customerName}`}
                      className="flex size-8 items-center justify-center rounded-[8px] text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                    >
                      <Phone className="size-4" />
                    </a>
                    <a
                      href={whatsappHref(
                        row.customerPhone,
                        `Hi ${row.customerName.split(" ")[0]}, following up on your enquiry${row.vehicleLabel ? ` for the ${row.vehicleLabel}` : ""}.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="WhatsApp"
                      className="flex size-8 items-center justify-center rounded-[8px] text-success-600 hover:bg-success-50"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                    <LeadMenu
                      row={row}
                      staff={staff}
                      canAssign={canAssign}
                      canManage={canManage}
                      onFollowUp={() => setFollowUpFor(row)}
                      onLost={() => setLostFor(row)}
                    />
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableShell>

      <FollowUpSheet lead={followUpFor} staff={staff} onClose={() => setFollowUpFor(null)} />
      <LostSheet lead={lostFor} onClose={() => setLostFor(null)} />
    </>
  );
}

function LeadMenu({
  row,
  staff,
  canAssign,
  canManage,
  onFollowUp,
  onLost,
}: {
  row: LeadRow;
  staff: Staff[];
  canAssign: boolean;
  canManage: boolean;
  onFollowUp: () => void;
  onLost: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = React.useTransition();

  const move = (stage: string) =>
    startTransition(async () => {
      if (stage === "lost") {
        onLost();
        return;
      }
      await updateLeadStage(row.id, stage);
      toast.success(`Moved to ${LEAD_STAGE_META[stage as LeadStage].label}`);
      router.refresh();
    });

  const assign = (ownerId: string | null) =>
    startTransition(async () => {
      await reassignLead(row.id, ownerId);
      toast.success("Lead reassigned");
      router.refresh();
    });

  return (
    <Popover
      align="right"
      panelClassName="max-h-[380px] overflow-y-auto thin-scrollbar"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          aria-label="Lead actions"
          className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <Link href={`/leads/${row.id}`} onClick={close}>
            <MenuItem icon={<Eye className="size-4" />}>Open lead</MenuItem>
          </Link>
          {canManage && (
            <MenuItem
              icon={<CalendarPlus className="size-4" />}
              onClick={() => {
                close();
                onFollowUp();
              }}
            >
              Schedule follow-up
            </MenuItem>
          )}

          {canManage && (
            <>
              <div className="my-1 border-t border-ink-100" />
              <p className="px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
                Move to stage
              </p>
              {PIPELINE_STAGES.filter((s) => s !== row.stage).map((s) => (
                <MenuItem
                  key={s}
                  onClick={() => {
                    close();
                    move(s);
                  }}
                >
                  {LEAD_STAGE_META[s].label}
                </MenuItem>
              ))}
            </>
          )}

          {canAssign && staff.length > 0 && (
            <>
              <div className="my-1 border-t border-ink-100" />
              <p className="px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
                Assign to
              </p>
              <MenuItem
                icon={<UserPlus className="size-4" />}
                onClick={() => {
                  close();
                  assign("auto");
                }}
              >
                Auto-assign (round robin)
              </MenuItem>
              {staff.map((s) => (
                <MenuItem
                  key={s.id}
                  onClick={() => {
                    close();
                    assign(s.id);
                  }}
                >
                  {s.name}
                </MenuItem>
              ))}
              {row.ownerId && (
                <MenuItem
                  destructive
                  onClick={() => {
                    close();
                    assign(null);
                  }}
                >
                  Unassign
                </MenuItem>
              )}
            </>
          )}
        </>
      )}
    </Popover>
  );
}

/* ---------------------------- MOBILE CARD ----------------------------- */

function LeadCard({
  row,
  staff,
  canAssign,
  canManage,
  onFollowUp,
  onLost,
}: {
  row: LeadRow;
  staff: Staff[];
  canAssign: boolean;
  canManage: boolean;
  onFollowUp: () => void;
  onLost: () => void;
}) {
  const stage = LEAD_STAGE_META[row.stage as LeadStage];
  const overdue = row.nextFollowUpAt && new Date(row.nextFollowUpAt) < new Date();

  return (
    <div className="rounded-[12px] border border-ink-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <Avatar name={row.customerName} size="sm" />
        <Link href={`/leads/${row.id}`} className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink-950">{row.customerName}</p>
              <p className="text-[11.5px] text-ink-400">
                <span className="font-mono">{row.reference}</span> · {row.customerPhone}
              </p>
            </div>
            <Badge tone={stage.tone} size="sm">{stage.short}</Badge>
          </div>
          <p className="mt-1.5 line-clamp-1 text-[12.5px] text-ink-600">
            {row.vehicleLabel ?? row.requirement ?? "General enquiry"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-400">
            <span>{LEAD_SOURCE_LABELS[row.source] ?? row.source}</span>
            {row.branchName && <span>· {row.branchName}</span>}
            <span>· {row.ownerName ?? "Unassigned"}</span>
          </div>
          {row.nextFollowUpAt && (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 text-[11.5px]",
                overdue ? "font-medium text-danger-600" : "text-ink-500",
              )}
            >
              <Clock3 className="size-3" />
              {overdue ? "Overdue" : "Follow up"} {formatDate(row.nextFollowUpAt)}
            </p>
          )}
        </Link>
        <LeadMenu
          row={row}
          staff={staff}
          canAssign={canAssign}
          canManage={canManage}
          onFollowUp={onFollowUp}
          onLost={onLost}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
        <a
          href={telHref(row.customerPhone)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] border border-ink-200 text-[13px] font-medium text-ink-700"
        >
          <Phone className="size-4" />
          Call
        </a>
        <a
          href={whatsappHref(
            row.customerPhone,
            `Hi ${row.customerName.split(" ")[0]}, following up on your enquiry${row.vehicleLabel ? ` for the ${row.vehicleLabel}` : ""}.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-success-600 text-[13px] font-medium text-white"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}

/* ------------------------------- SHEETS ------------------------------- */

export function FollowUpSheet({
  lead,
  staff,
  onClose,
}: {
  lead: LeadRow | null;
  staff: Staff[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  if (!lead) return null;

  const submit = (formData: FormData) =>
    startTransition(async () => {
      const res = await createFollowUp({
        leadId: lead.id,
        dueAt: String(formData.get("dueAt")),
        type: String(formData.get("type")),
        note: String(formData.get("note") ?? ""),
        assignedToId: String(formData.get("assignedToId") ?? "") || null,
      });
      if (res.status === "success") {
        toast.success("Follow-up scheduled");
        onClose();
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not schedule");
      }
    });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  return (
    <Sheet open onClose={onClose} title="Schedule a follow-up" description={lead.customerName} size="sm">
      <form action={submit} className="space-y-4">
        <Field label="When" required>
          <Input name="dueAt" type="datetime-local" required defaultValue={toDateTimeLocal(tomorrow)} />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue="call">
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        {staff.length > 0 && (
          <Field label="Assign to">
            <Select name="assignedToId" defaultValue={lead.ownerId ?? ""}>
              <option value="">Lead owner</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note" hint="What do you need to do or say?">
          <Textarea name="note" rows={3} placeholder="Call back with the manager-approved price." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Schedule</Button>
        </div>
      </form>
    </Sheet>
  );
}

function LostSheet({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  if (!lead) return null;

  const submit = (formData: FormData) =>
    startTransition(async () => {
      await updateLeadStage(lead.id, "lost", String(formData.get("reason")));
      toast.info("Lead marked lost");
      onClose();
      router.refresh();
    });

  return (
    <Sheet open onClose={onClose} title="Mark lead as lost" description={lead.customerName} size="sm">
      <form action={submit} className="space-y-4">
        <Field label="Reason" required hint="Recorded on the lead so you can spot patterns later.">
          <Select name="reason" required defaultValue={LOST_REASONS[0]}>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={pending}>Mark lost</Button>
        </div>
      </form>
    </Sheet>
  );
}
