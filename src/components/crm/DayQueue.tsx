"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, MessageCircle, CheckCircle2, ChevronRight, ExternalLink, PartyPopper,
  SkipForward, CalendarClock, AlarmClock, CarFront, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { completeQueueTask, logQuickOutreach } from "@/app/actions/attention";
import { ACTION_PRIORITY_META, FOLLOW_UP_OUTCOMES, type ActionPriority } from "@/lib/attention";
import { telHref, whatsappHref, cn } from "@/lib/utils";

export type QueueTaskView = {
  id: string;
  kind: "followup" | "lead" | "testdrive" | "booking" | "requirement";
  priority: ActionPriority;
  title: string;
  subtitle: string;
  reason: string;
  customerName: string;
  phone: string | null;
  leadId: string | null;
  followUpId: string | null;
  vehicle: string | null;
  href: string;
  dueAt: string | null;
};

const KIND_ICON = {
  followup: AlarmClock,
  lead: UserPlus,
  testdrive: CarFront,
  booking: CalendarClock,
  requirement: CalendarClock,
};

/** Sensible next-follow-up options, so nobody has to reach for a date picker. */
const NEXT_OPTIONS = [
  { value: "2h", label: "In 2 hours", hours: 2 },
  { value: "tomorrow", label: "Tomorrow morning", hours: null },
  { value: "3d", label: "In 3 days", hours: 72 },
  { value: "1w", label: "Next week", hours: 168 },
  { value: "none", label: "No follow-up needed", hours: null },
  { value: "custom", label: "Pick a date and time", hours: null },
];

function resolveNext(value: string, custom: string): string | null {
  if (value === "none") return null;
  if (value === "custom") return custom || null;
  if (value === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }
  const option = NEXT_OPTIONS.find((o) => o.value === value);
  if (!option?.hours) return null;
  return new Date(Date.now() + option.hours * 3600 * 1000).toISOString();
}

/**
 * Start my day.
 *
 * One customer on screen at a time, ordered so the salesperson never has to
 * decide what to open next. Call or WhatsApp, say what happened, book the next
 * step, and the following task loads on its own.
 *
 * Built mobile-first: the whole thing works with a thumb, and the two actions
 * that matter — call and save — are the largest targets on the screen.
 */
export function DayQueue({
  tasks,
  queueLabel,
}: {
  tasks: QueueTaskView[];
  queueLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [index, setIndex] = React.useState(0);
  const [done, setDone] = React.useState<string[]>([]);
  const [pending, startTransition] = React.useTransition();

  const [outcome, setOutcome] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const [next, setNext] = React.useState("tomorrow");
  const [customNext, setCustomNext] = React.useState("");

  const remaining = tasks.filter((t) => !done.includes(t.id));
  const task = remaining[Math.min(index, Math.max(0, remaining.length - 1))];
  const completed = done.length;
  const total = tasks.length;

  const reset = () => {
    setOutcome("");
    setNote("");
    setNext("tomorrow");
    setCustomNext("");
  };

  const advance = (taskId: string) => {
    setDone((d) => [...d, taskId]);
    setIndex(0);
    reset();
    router.refresh();
  };

  const save = () => {
    if (!task) return;
    if (!outcome) {
      toast.error("Pick what happened first");
      return;
    }
    if (!task.leadId) {
      toast.error("This task is not linked to a lead — open it instead");
      return;
    }

    startTransition(async () => {
      const res = await completeQueueTask({
        followUpId: task.followUpId,
        leadId: task.leadId!,
        outcome,
        note: note.trim() || undefined,
        nextAt: resolveNext(next, customNext),
      });
      if (res.status === "success") {
        toast.success(res.message);
        advance(task.id);
      } else {
        toast.error(res.message);
      }
    });
  };

  const logContact = (channel: "call" | "whatsapp") => {
    if (!task?.leadId) return;
    void logQuickOutreach({ leadId: task.leadId, channel });
  };

  /* ----------------------------- finished ----------------------------- */

  if (!task) {
    return (
      <div className="rounded-[14px] border border-success-200 bg-success-50/50 px-6 py-14 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-white text-success-600 ring-1 ring-success-100 ring-inset">
          <PartyPopper className="size-6" />
        </span>
        <p className="font-display text-[19px] font-semibold text-ink-950">
          {completed > 0 ? "That is the queue cleared" : "Nothing waiting"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-600">
          {completed > 0
            ? `You worked through ${completed} customer${completed === 1 ? "" : "s"}. Every follow-up is logged and the next steps are booked.`
            : "No overdue follow-ups, no unanswered enquiries and nothing scheduled that needs you right now."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/attention"
            className="inline-flex h-10 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Back to the action centre
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-[10px] bg-ink-900 px-4 text-[13.5px] font-medium text-white hover:bg-ink-800"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const Icon = KIND_ICON[task.kind] ?? AlarmClock;
  const priority = ACTION_PRIORITY_META[task.priority];

  return (
    <div className="pb-40 lg:pb-0">
      {/* Progress */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px] text-ink-500">
          <span className="font-medium">{queueLabel}</span>
          <span className="tabular-nums">
            {completed} of {total} done
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* The customer */}
      <div className="rounded-[16px] border border-ink-200 bg-white p-5">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-inset",
              task.priority === "critical"
                ? "bg-danger-50 text-danger-600 ring-danger-100"
                : task.priority === "high"
                  ? "bg-warning-50 text-warning-600 ring-warning-100"
                  : "bg-brand-50 text-brand-600 ring-brand-100",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] leading-tight font-semibold text-ink-950">
                {task.customerName}
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600"
                title={priority.blurb}
              >
                <span className={cn("size-1.5 rounded-full", priority.dot)} />
                {priority.label}
              </span>
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-600">{task.subtitle}</p>
            <p className="mt-2 rounded-[9px] bg-ink-50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-700">
              {task.reason}
            </p>
          </div>
        </div>

        {/* Reach them. Opening the dialler is the point of this screen. */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <a
            href={task.phone ? telHref(task.phone) : "#"}
            onClick={() => logContact("call")}
            aria-disabled={!task.phone}
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-[11px] text-[14px] font-semibold transition-colors",
              task.phone
                ? "bg-ink-900 text-white hover:bg-ink-800"
                : "pointer-events-none bg-ink-100 text-ink-400",
            )}
          >
            <Phone className="size-[18px]" />
            Call
          </a>
          <a
            href={
              task.phone
                ? whatsappHref(
                    task.phone,
                    `Hi ${task.customerName.split(" ")[0]}, ${
                      task.vehicle
                        ? `following up on the ${task.vehicle}.`
                        : "following up on your enquiry."
                    }`,
                  )
                : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logContact("whatsapp")}
            aria-disabled={!task.phone}
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-[11px] text-[14px] font-semibold transition-colors",
              task.phone
                ? "bg-success-600 text-white hover:bg-success-700"
                : "pointer-events-none bg-ink-100 text-ink-400",
            )}
          >
            <MessageCircle className="size-[18px]" />
            WhatsApp
          </a>
        </div>

        <Link
          href={task.href}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-500 hover:text-ink-900"
        >
          Open the full record
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {/* What happened */}
      <div className="mt-4 rounded-[16px] border border-ink-200 bg-white p-5">
        <p className="field-label mb-2.5">How did it go?</p>
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                outcome === o.value
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-200 text-ink-600 hover:border-ink-300",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Note" hint="Optional — what was said, in a line">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Wants to see it on Saturday. Asked about the exchange value on his Swift."
            />
          </Field>

          <Field label="Next follow-up">
            <Select value={next} onChange={(e) => setNext(e.target.value)}>
              {NEXT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          {next === "custom" && (
            <Field label="When">
              <Input
                type="datetime-local"
                value={customNext}
                onChange={(e) => setCustomNext(e.target.value)}
              />
            </Field>
          )}
        </div>
      </div>

      {/* Save & next — sticky above the tab bar on a phone */}
      <div className="above-tabbar safe-bottom fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,24,40,0.06)] backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => {
            setIndex((i) => i + 1);
            reset();
          }}
          title="Leave this one for later"
        >
          <SkipForward className="size-4" />
          <span className="hidden sm:inline">Skip</span>
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1 lg:flex-none lg:px-8"
          loading={pending}
          onClick={save}
        >
          <CheckCircle2 className="size-[18px]" />
          Save &amp; next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
