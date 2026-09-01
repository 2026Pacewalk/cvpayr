"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/form";
import { LEAD_SOURCES, LEAD_PRIORITIES, PIPELINE_STAGES, LEAD_STAGE_META } from "@/lib/constants";

/**
 * Compact filter control for the leads views.
 * Desktop shows the selects inline; mobile collapses them into a bottom sheet.
 */
export function LeadFilterBar({
  branches,
  staff,
  showOwnerFilter,
  showStageFilter = true,
}: {
  branches: { id: string; name: string; city: string }[];
  staff: { id: string; name: string }[];
  showOwnerFilter: boolean;
  showStageFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    ["branch", "owner", "source", "priority", "stage", "bucket"].forEach((k) => params.delete(k));
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const active = ["branch", "owner", "source", "priority", "stage"].filter((k) =>
    searchParams.get(k),
  ).length;

  const controls = (
    <>
      {branches.length > 1 && (
        <Field label="Branch">
          <Select value={searchParams.get("branch") ?? ""} onChange={(e) => set("branch", e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {showOwnerFilter && (
        <Field label="Owner">
          <Select value={searchParams.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)}>
            <option value="">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {showStageFilter && (
        <Field label="Stage">
          <Select value={searchParams.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)}>
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Source">
        <Select value={searchParams.get("source") ?? ""} onChange={(e) => set("source", e.target.value)}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Priority">
        <Select value={searchParams.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
          <option value="">Any priority</option>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </Field>
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[13.5px] font-medium text-ink-700 shadow-xs lg:hidden"
      >
        <SlidersHorizontal className="size-4" />
        Filters
        {active > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
            {active}
          </span>
        )}
      </button>

      {/* Desktop inline */}
      <div className="hidden items-end gap-2.5 lg:flex [&_label]:text-[12px] [&>div]:w-[150px]">
        {controls}
        {active > 0 && (
          <button
            onClick={clearAll}
            className="mb-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
          >
            <X className="size-3.5" />
            Clear
          </button>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter leads"
        size="sm"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={clearAll} className="shrink-0">Clear</Button>
            <Button fullWidth onClick={() => setOpen(false)}>Apply</Button>
          </div>
        }
      >
        <div className="space-y-4">{controls}</div>
      </Sheet>
    </>
  );
}
