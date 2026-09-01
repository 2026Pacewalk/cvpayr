import Link from "next/link";
import { Timer, AlertTriangle, Zap } from "lucide-react";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/primitives";
import { WhatsAppSend, CallButton } from "./WhatsAppSend";
import { cn, vehicleTitle } from "@/lib/utils";

export type ResponseQueueItem = {
  id: string;
  reference: string;
  waitingMinutes: number;
  customer: { name: string; phone: string };
  vehicle: { year: number; make: string; model: string } | null;
  owner: { name: string } | null;
  branch: { name: string } | null;
};

/** Human-readable wait, tuned for the ranges that actually matter on a sales floor. */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function severity(minutes: number) {
  if (minutes > 60) return { tone: "danger" as const, label: "Over an hour" };
  if (minutes > 30) return { tone: "warning" as const, label: "Over 30 min" };
  return { tone: "info" as const, label: "Waiting" };
}

/**
 * Leads nobody has replied to yet, oldest first.
 *
 * This is the single most actionable list on the dashboard: an unanswered
 * enquiry is the one problem that gets worse purely by being ignored.
 */
export function ResponseQueue({
  items,
  averageMinutes,
  canManage,
  limit = 6,
}: {
  items: ResponseQueueItem[];
  averageMinutes: number | null;
  canManage: boolean;
  limit?: number;
}) {
  const shown = items.slice(0, limit);

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Waiting for a first reply"
          description={
            averageMinutes != null
              ? `Your team averages ${formatWait(averageMinutes)} to first response`
              : "No responses recorded yet"
          }
          icon={<Timer className="size-4" />}
          action={
            items.length > limit ? (
              <Link href="/leads?bucket=uncontacted" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                All {items.length}
              </Link>
            ) : null
          }
        />
      </div>

      {shown.length ? (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {shown.map((lead) => {
            const sev = severity(lead.waitingMinutes);
            return (
              <li key={lead.id} className="p-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={sev.tone} size="sm" dot>
                        {formatWait(lead.waitingMinutes)}
                      </Badge>
                      <span className="font-mono text-[10.5px] text-ink-400">{lead.reference}</span>
                    </div>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="mt-1.5 block text-[14px] font-semibold text-ink-950 hover:text-brand-700"
                    >
                      {lead.customer.name}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">
                      {lead.vehicle ? vehicleTitle(lead.vehicle) : "General enquiry"}
                      {lead.branch && ` · ${lead.branch.name}`}
                      {" · "}
                      {lead.owner?.name ?? "Unassigned"}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 gap-1.5">
                      <CallButton
                        leadId={lead.id}
                        phone={lead.customer.phone}
                        size="sm"
                        label=""
                        className="px-2.5"
                      />
                      <WhatsAppSend leadId={lead.id} size="sm" label="" className="px-2.5" />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-t border-ink-100 p-5">
          <EmptyState
            compact
            icon={<Zap className="size-5" />}
            title="Every lead has been answered"
            description="Nothing is sitting unattended right now."
          />
        </div>
      )}
    </Card>
  );
}

/** Compact banner for the top of the dashboard when leads are going stale. */
export function ResponseAlert({ over30, over60 }: { over30: number; over60: number }) {
  if (over30 === 0) return null;
  const critical = over60 > 0;

  return (
    <Link
      href="/leads?bucket=uncontacted"
      className={cn(
        "flex items-center gap-3 rounded-[12px] border p-3.5 transition-colors",
        critical
          ? "border-danger-100 bg-danger-50 hover:bg-danger-100/60"
          : "border-warning-100 bg-warning-50 hover:bg-warning-100/60",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-white",
          critical ? "text-danger-600" : "text-warning-600",
        )}
      >
        <AlertTriangle className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-semibold", critical ? "text-danger-700" : "text-warning-700")}>
          {critical
            ? `${over60} lead${over60 === 1 ? "" : "s"} waiting over an hour`
            : `${over30} lead${over30 === 1 ? "" : "s"} waiting over 30 minutes`}
        </p>
        <p className={cn("text-[12.5px]", critical ? "text-danger-700/70" : "text-warning-700/70")}>
          Nobody has replied to these enquiries yet.
        </p>
      </div>
    </Link>
  );
}
