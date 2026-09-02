"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BanIcon, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { Card, CardHeader } from "@/components/ui/primitives";
import { addSmsOptOut, removeSmsOptOut } from "@/app/actions/sms";
import { relativeTime } from "@/lib/utils";

export type OptOutRow = {
  id: string;
  phone: string;
  reason: string | null;
  source: string;
  createdAt: string;
};

/**
 * The do-not-message register.
 *
 * TRAI puts the obligation on the sender and the penalty on the dealership's own
 * DLT registration, so this is not a nicety. The check runs inside the send path
 * rather than here, which is why a number added on this screen is honoured by
 * every part of the app at once.
 */
export function SmsOptOutManager({ optOuts }: { optOuts: OptOutRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [reason, setReason] = React.useState("");

  const add = () =>
    startTransition(async () => {
      const res = await addSmsOptOut({ phone, reason });
      if (res.status === "success") {
        toast.success(res.message);
        setPhone("");
        setReason("");
        setAdding(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Do not message"
          description="Numbers that have asked you to stop. Checked on every send, wherever it comes from."
          icon={<BanIcon className="size-4" />}
          action={
            !adding ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                Add a number
              </Button>
            ) : null
          }
        />

        {adding && (
          <div className="mt-4 rounded-[10px] border-2 border-brand-300 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile number" required>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  prefix="+91"
                  inputMode="numeric"
                  placeholder="98765 43210"
                />
              </Field>
              <Field label="Reason" hint="Optional — for your own records">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Asked us to stop over the phone"
                />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={pending} onClick={add}>
                Add to the list
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {optOuts.length > 0 ? (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {optOuts.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-900">{o.phone}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-400">
                  {o.reason ? `${o.reason} · ` : ""}
                  added {relativeTime(o.createdAt)}
                  {o.source !== "manual" && ` · ${o.source}`}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${o.phone}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await removeSmsOptOut(o.id);
                    if (res.status === "success") toast.success(res.message);
                    else toast.error(res.message);
                    router.refresh();
                  })
                }
                className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-300 hover:bg-ink-100 hover:text-ink-600"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-ink-100 px-5 py-8 text-center text-[13px] text-ink-500">
          Nobody has opted out. Add a number here the moment someone asks you to stop.
        </p>
      )}
    </Card>
  );
}
