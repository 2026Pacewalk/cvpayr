"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check, Send, CalendarPlus, CarFront, Handshake,
  UserCog, Loader2, StickyNote, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/primitives";
import {
  updateLeadStage, reassignLead, addLeadNote, logCall, createFollowUp, createTestDrive,
} from "@/app/actions/leads";
import { createBooking, recordSale } from "@/app/actions/sales";
import {
  PIPELINE_STAGES, LEAD_STAGE_META, LOST_REASONS, FOLLOW_UP_TYPES, type LeadStage,
} from "@/lib/constants";
import { cn, toDateTimeLocal, toDateInput } from "@/lib/utils";
import { WhatsAppSend, CallButton } from "./WhatsAppSend";

type Staff = { id: string; name: string };

export type LeadWorkspaceProps = {
  leadId: string;
  stage: string;
  ownerId: string | null;
  customerName: string;
  customerPhone: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  vehiclePrice: number | null;
  staff: Staff[];
  canManage: boolean;
  canAssign: boolean;
  canSell: boolean;
};

/** Horizontal stage stepper — the fastest way to move a deal forward. */
export function StageStepper({
  leadId,
  stage,
  canManage,
}: {
  leadId: string;
  stage: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [lostOpen, setLostOpen] = React.useState(false);

  const current = PIPELINE_STAGES.indexOf(stage as LeadStage);
  const isClosed = LEAD_STAGE_META[stage as LeadStage]?.group !== "open";

  const move = (next: LeadStage) => {
    if (next === "lost") {
      setLostOpen(true);
      return;
    }
    startTransition(async () => {
      await updateLeadStage(leadId, next);
      toast.success(`Moved to ${LEAD_STAGE_META[next].label}`);
      router.refresh();
    });
  };

  return (
    <>
      <div className="rounded-[12px] border border-ink-200 bg-white p-3">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {PIPELINE_STAGES.filter((s) => s !== "lost").map((s, i) => {
            const meta = LEAD_STAGE_META[s];
            const active = s === stage;
            const done = current > -1 && i < current && !isClosed;
            return (
              <button
                key={s}
                disabled={!canManage || pending || active}
                onClick={() => move(s)}
                title={meta.label}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-ink-900 text-white"
                    : done
                      ? "bg-success-50 text-success-700"
                      : "border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-60",
                )}
              >
                {done && <Check className="size-3" />}
                {meta.short}
              </button>
            );
          })}
          {canManage && stage !== "lost" && stage !== "not_interested" && (
            <button
              onClick={() => setLostOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-danger-100 px-3 py-1.5 text-[12.5px] font-medium text-danger-600 hover:bg-danger-50"
            >
              <XCircle className="size-3.5" />
              Lost
            </button>
          )}
          {stage === "lost" && <Badge tone="danger">Lost</Badge>}
          {stage === "not_interested" && <Badge tone="neutral">Not interested</Badge>}
        </div>
      </div>

      <Sheet open={lostOpen} onClose={() => setLostOpen(false)} title="Mark lead as lost" size="sm">
        <form
          action={(formData) =>
            startTransition(async () => {
              await updateLeadStage(leadId, "lost", String(formData.get("reason")));
              toast.info("Lead marked lost");
              setLostOpen(false);
              router.refresh();
            })
          }
          className="space-y-4"
        >
          <Field label="Reason" required hint="Lost reasons feed the lead report.">
            <Select name="reason" required defaultValue={LOST_REASONS[0]}>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={pending}>Mark lost</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** Quick action row + all the sheets a salesperson needs on this screen. */
export function LeadActions(props: LeadWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [sheet, setSheet] = React.useState<
    null | "call" | "followup" | "testdrive" | "booking" | "sale" | "assign"
  >(null);

  const close = () => setSheet(null);
  const done = (message: string) => {
    toast.success(message);
    close();
    router.refresh();
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
        <CallButton
          leadId={props.leadId}
          phone={props.customerPhone}
          size="lg"
          fullWidth
          onAfterCall={() => setTimeout(() => setSheet("call"), 900)}
        />
        <WhatsAppSend leadId={props.leadId} size="lg" fullWidth />

        {props.canManage && (
          <>
            <Button variant="outline" size="lg" onClick={() => setSheet("followup")}>
              <CalendarPlus className="size-4" />
              Follow-up
            </Button>
            <Button variant="outline" size="lg" onClick={() => setSheet("testdrive")}>
              <CarFront className="size-4" />
              Test drive
            </Button>
          </>
        )}

        {props.canSell && props.vehicleId && (
          <>
            <Button variant="outline" size="lg" onClick={() => setSheet("booking")}>
              <Handshake className="size-4" />
              Book
            </Button>
            <Button size="lg" onClick={() => setSheet("sale")}>
              <Handshake className="size-4" />
              Mark sold
            </Button>
          </>
        )}

        {props.canAssign && (
          <Button variant="ghost" size="lg" onClick={() => setSheet("assign")} className="col-span-2 sm:col-span-1">
            <UserCog className="size-4" />
            Assign
          </Button>
        )}
      </div>

      {/* Log call */}
      <Sheet open={sheet === "call"} onClose={close} title="How did the call go?" size="sm">
        <form
          action={(fd) =>
            startTransition(async () => {
              await logCall(props.leadId, String(fd.get("outcome")), String(fd.get("note") ?? ""));
              done("Call logged");
            })
          }
          className="space-y-4"
        >
          <Field label="Outcome" required>
            <Select name="outcome" required>
              <option>Connected</option>
              <option>No answer</option>
              <option>Busy — call later</option>
              <option>Wrong number</option>
              <option>Switched off</option>
            </Select>
          </Field>
          <Field label="What was discussed">
            <Textarea name="note" rows={3} placeholder="Customer wants an automatic SUV under ₹12 lakh. Follow up Friday." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Skip</Button>
            <Button type="submit" loading={pending}>Save</Button>
          </div>
        </form>
      </Sheet>

      {/* Follow-up */}
      <Sheet open={sheet === "followup"} onClose={close} title="Schedule a follow-up" size="sm">
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await createFollowUp({
                leadId: props.leadId,
                dueAt: String(fd.get("dueAt")),
                type: String(fd.get("type")),
                note: String(fd.get("note") ?? ""),
                assignedToId: String(fd.get("assignedToId") ?? "") || null,
              });
              if (res.status === "success") done("Follow-up scheduled");
              else toast.error(res.message ?? "Could not schedule");
            })
          }
          className="space-y-4"
        >
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
          {props.staff.length > 0 && (
            <Field label="Assign to">
              <Select name="assignedToId" defaultValue={props.ownerId ?? ""}>
                <option value="">Lead owner</option>
                {props.staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Note">
            <Textarea name="note" rows={2} placeholder="Share the inspection report on WhatsApp." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" loading={pending}>Schedule</Button>
          </div>
        </form>
      </Sheet>

      {/* Test drive */}
      <Sheet open={sheet === "testdrive"} onClose={close} title="Schedule a test drive" size="sm">
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await createTestDrive({
                leadId: props.leadId,
                vehicleId: props.vehicleId,
                scheduledAt: String(fd.get("scheduledAt")),
                assignedToId: String(fd.get("assignedToId") ?? "") || null,
                note: String(fd.get("note") ?? ""),
              });
              if (res.status === "success") done("Test drive scheduled");
              else toast.error(res.message ?? "Could not schedule");
            })
          }
          className="space-y-4"
        >
          <p className="rounded-[10px] bg-ink-50 p-3 text-[12.5px] text-ink-600">
            {props.vehicleLabel ?? "No vehicle linked to this lead yet."}
          </p>
          <Field label="Date & time" required>
            <Input name="scheduledAt" type="datetime-local" required defaultValue={toDateTimeLocal(tomorrow)} />
          </Field>
          {props.staff.length > 0 && (
            <Field label="Accompanied by">
              <Select name="assignedToId" defaultValue={props.ownerId ?? ""}>
                <option value="">Lead owner</option>
                {props.staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Note">
            <Textarea name="note" rows={2} placeholder="Customer will bring their licence and address proof." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" loading={pending}>Schedule</Button>
          </div>
        </form>
      </Sheet>

      {/* Booking */}
      <Sheet open={sheet === "booking"} onClose={close} title="Record a booking" size="sm">
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await createBooking({
                vehicleId: props.vehicleId!,
                leadId: props.leadId,
                customerName: props.customerName,
                customerPhone: props.customerPhone,
                bookingAmount: Number(fd.get("bookingAmount") ?? 0),
                agreedPrice: Number(fd.get("agreedPrice") ?? 0),
                paymentMode: String(fd.get("paymentMode") ?? ""),
                note: String(fd.get("note") ?? ""),
              });
              if (res.status === "success") done(res.message);
              else toast.error(res.message);
            })
          }
          className="space-y-4"
        >
          <p className="rounded-[10px] bg-ink-50 p-3 text-[12.5px] text-ink-600">
            {props.vehicleLabel}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Token amount" required>
              <Input name="bookingAmount" type="number" required prefix="₹" defaultValue={25000} inputMode="numeric" />
            </Field>
            <Field label="Agreed price" required>
              <Input name="agreedPrice" type="number" required prefix="₹" defaultValue={props.vehiclePrice ?? undefined} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Payment mode">
            <Select name="paymentMode" defaultValue="UPI">
              <option>UPI</option>
              <option>Cash</option>
              <option>Bank Transfer</option>
              <option>Cheque</option>
              <option>Card</option>
            </Select>
          </Field>
          <Field label="Note">
            <Textarea name="note" rows={2} placeholder="Delivery after insurance transfer." />
          </Field>
          <div className="rounded-[10px] bg-info-50 p-3 text-[12.5px] text-info-700">
            The vehicle moves to <strong>Booked</strong> and the lead advances to the booked stage.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" loading={pending}>Record booking</Button>
          </div>
        </form>
      </Sheet>

      {/* Sale */}
      <Sheet open={sheet === "sale"} onClose={close} title="Complete the sale" size="md">
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await recordSale({
                vehicleId: props.vehicleId!,
                leadId: props.leadId,
                customerName: props.customerName,
                customerPhone: props.customerPhone,
                salePrice: Number(fd.get("salePrice") ?? 0),
                otherCharges: Number(fd.get("otherCharges") ?? 0),
                paymentMode: String(fd.get("paymentMode") ?? ""),
                financeProvider: String(fd.get("financeProvider") ?? ""),
                soldAt: String(fd.get("soldAt") ?? ""),
              });
              if (res.status === "success") done(res.message);
              else toast.error(res.message);
            })
          }
          className="space-y-4"
        >
          <p className="rounded-[10px] bg-ink-50 p-3 text-[12.5px] text-ink-600">
            {props.vehicleLabel} → {props.customerName}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Final sale price" required>
              <Input name="salePrice" type="number" required prefix="₹" defaultValue={props.vehiclePrice ?? undefined} inputMode="numeric" />
            </Field>
            <Field label="Other charges" hint="RTO, insurance, handling">
              <Input name="otherCharges" type="number" prefix="₹" defaultValue={0} inputMode="numeric" />
            </Field>
            <Field label="Sale date">
              <Input name="soldAt" type="date" defaultValue={toDateInput(new Date())} />
            </Field>
            <Field label="Payment mode">
              <Select name="paymentMode" defaultValue="Full Payment">
                <option>Full Payment</option>
                <option>Finance</option>
                <option>Part Exchange</option>
                <option>Bank Transfer</option>
              </Select>
            </Field>
            <Field label="Finance provider" className="sm:col-span-2">
              <Input name="financeProvider" placeholder="e.g. HDFC Bank" />
            </Field>
          </div>
          <div className="rounded-[10px] bg-info-50 p-3 text-[12.5px] text-info-700">
            The vehicle is archived as <strong>Sold</strong>, the lead is marked won, and any other
            open enquiry on this car is closed as <em>Vehicle sold</em>.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" loading={pending}>Complete sale</Button>
          </div>
        </form>
      </Sheet>

      {/* Assign */}
      <Sheet open={sheet === "assign"} onClose={close} title="Assign this lead" size="sm">
        <div className="space-y-1.5">
          <button
            onClick={() =>
              startTransition(async () => {
                await reassignLead(props.leadId, "auto");
                done("Auto-assigned to the least loaded executive");
              })
            }
            className="flex w-full items-center justify-between rounded-[10px] border border-ink-200 px-3.5 py-3 text-left text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Auto-assign (round robin)
            <span className="text-[11.5px] text-ink-400">Fewest open leads</span>
          </button>
          {props.staff.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                startTransition(async () => {
                  await reassignLead(props.leadId, s.id);
                  done(`Assigned to ${s.name}`);
                })
              }
              disabled={s.id === props.ownerId}
              className={cn(
                "flex w-full items-center justify-between rounded-[10px] border px-3.5 py-3 text-left text-[13.5px] font-medium transition-colors",
                s.id === props.ownerId
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-ink-200 text-ink-700 hover:bg-ink-50",
              )}
            >
              {s.name}
              {s.id === props.ownerId && <span className="text-[11.5px]">Current owner</span>}
            </button>
          ))}
          {props.ownerId && (
            <button
              onClick={() =>
                startTransition(async () => {
                  await reassignLead(props.leadId, null);
                  done("Lead unassigned");
                })
              }
              className="flex w-full items-center rounded-[10px] border border-danger-100 px-3.5 py-3 text-left text-[13.5px] font-medium text-danger-600 hover:bg-danger-50"
            >
              Unassign
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Inline note composer that appends to the activity timeline. */
export function NoteComposer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!value.trim()) return;
    startTransition(async () => {
      const res = await addLeadNote(leadId, value);
      if (res.status === "success") {
        setValue("");
        toast.success("Note added");
        router.refresh();
      } else {
        toast.error(res.message ?? "Could not save the note");
      }
    });
  };

  return (
    <div className="rounded-[12px] border border-ink-200 bg-white p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-ink-100 text-ink-500">
          <StickyNote className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            rows={2}
            placeholder="Add a note — what did the customer say?"
            className="w-full resize-y rounded-[8px] border border-ink-200 px-3 py-2 text-[13.5px] placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-ink-400">Ctrl + Enter to save</p>
            <Button size="sm" onClick={submit} disabled={!value.trim() || pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Add note
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
