"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Check } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { updateCustomer } from "@/app/actions/leads";

/** Free-form internal notes on a customer record, saved inline. */
export function CustomerNotes({
  customerId,
  initialNotes,
  canEdit,
}: {
  customerId: string;
  initialNotes: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = React.useState(initialNotes);
  const [pending, startTransition] = React.useTransition();
  const dirty = value !== initialNotes;

  if (!canEdit && !initialNotes) return null;

  return (
    <Card>
      <CardHeader title="Internal notes" icon={<StickyNote className="size-4" />} />
      {canEdit ? (
        <div className="mt-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder="Prefers automatic. Budget stretched to ₹13 lakh after finance approval. Brother also looking for a hatchback."
          />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-ink-400">Visible to your team only.</p>
            <Button
              size="sm"
              disabled={!dirty || pending}
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await updateCustomer(customerId, { notes: value });
                  if (res.status === "success") {
                    toast.success("Notes saved");
                    router.refresh();
                  } else {
                    toast.error(res.message ?? "Could not save");
                  }
                })
              }
            >
              <Check className="size-3.5" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-line text-ink-600">
          {initialNotes}
        </p>
      )}
    </Card>
  );
}
