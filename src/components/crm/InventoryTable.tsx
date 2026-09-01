"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Star, Copy, ArrowRightLeft, Eye, Pencil, Loader2, CheckSquare } from "lucide-react";
import { TableShell, Th, Td, Tr } from "@/components/ui/Table";
import { Badge } from "@/components/ui/primitives";
import { Popover, MenuItem, Sheet } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Select, Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { VehicleImage } from "@/components/VehicleImage";
import {
  bulkUpdateStatus, changeVehicleStatus, toggleFeatured, transferVehicle, cloneVehicle,
} from "@/app/actions/vehicles";
import { formatPrice, formatKm, cn } from "@/lib/utils";
import {
  VEHICLE_STATUS_META, VEHICLE_STATUSES, ageingBucket, type VehicleStatus,
} from "@/lib/constants";

export type InventoryRow = {
  id: string;
  stockId: string;
  title: string;
  variant: string | null;
  year: number;
  kmDriven: number;
  fuelType: string;
  transmission: string;
  sellingPrice: number;
  status: string;
  isFeatured: boolean;
  branchId: string;
  branchName: string;
  enquiryCount: number;
  imageUrl: string | null;
  days: number;
  margin: { profit: number; marginPct: number } | null;
};

type Props = {
  rows: InventoryRow[];
  branches: { id: string; name: string; city: string }[];
  canEdit: boolean;
  canTransfer: boolean;
  canCreate: boolean;
  showMargin: boolean;
};

export function InventoryTable({ rows, branches, canEdit, canTransfer, canCreate, showMargin }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [bulkStatus, setBulkStatus] = React.useState("available");
  const [transferFor, setTransferFor] = React.useState<InventoryRow | null>(null);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runBulk = () => {
    startTransition(async () => {
      const res = await bulkUpdateStatus(selected, bulkStatus);
      toast.success(`${res.count} vehicle${res.count === 1 ? "" : "s"} updated`);
      setSelected([]);
      router.refresh();
    });
  };

  const onStatus = (id: string, status: string) =>
    startTransition(async () => {
      await changeVehicleStatus(id, status);
      toast.success(`Marked ${VEHICLE_STATUS_META[status as VehicleStatus].label.toLowerCase()}`);
      router.refresh();
    });

  const onFeature = (id: string) =>
    startTransition(async () => {
      const res = await toggleFeatured(id);
      if (res.status === "success") {
        toast.success(res.isFeatured ? "Featured on your website" : "Removed from featured");
        router.refresh();
      }
    });

  return (
    <>
      {/* Bulk action bar */}
      {canEdit && selected.length > 0 && (
        <div className="animate-slide-up sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-ink-900 bg-ink-900 px-3.5 py-2.5 text-white shadow-lg">
          <CheckSquare className="size-4 shrink-0" />
          <span className="text-[13px] font-medium">
            {selected.length} selected
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            aria-label="Bulk status"
            className="h-8 rounded-[8px] border border-white/20 bg-white/10 px-2 text-[12.5px] text-white focus:outline-none"
          >
            {VEHICLE_STATUSES.filter((s) => s !== "sold").map((s) => (
              <option key={s} value={s} className="text-ink-900">
                Mark {VEHICLE_STATUS_META[s].label}
              </option>
            ))}
          </select>
          <button
            onClick={runBulk}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-white px-3 text-[12.5px] font-medium text-ink-900 disabled:opacity-60"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Apply
          </button>
          <button
            onClick={() => setSelected([])}
            className="ml-auto text-[12.5px] text-white/60 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      <TableShell
        mobile={
          <>
            {rows.map((row) => (
              <MobileRow
                key={row.id}
                row={row}
                canEdit={canEdit}
                selected={selected.includes(row.id)}
                onToggle={() => toggle(row.id)}
                showMargin={showMargin}
              />
            ))}
          </>
        }
      >
        <thead>
          <tr>
            {canEdit && (
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
                  className="size-4 rounded border-ink-300 accent-brand-600"
                />
              </Th>
            )}
            <Th>Vehicle</Th>
            <Th>Branch</Th>
            <Th align="right">Price</Th>
            {showMargin && <Th align="right">Margin</Th>}
            <Th align="center">Ageing</Th>
            <Th align="center">Enquiries</Th>
            <Th>Status</Th>
            <Th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = VEHICLE_STATUS_META[row.status as VehicleStatus];
            const bucket = ageingBucket(row.days);
            return (
              <Tr key={row.id} className={cn(selected.includes(row.id) && "bg-brand-50/40")}>
                {canEdit && (
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.stockId}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-4 rounded border-ink-300 accent-brand-600"
                    />
                  </Td>
                )}
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-[8px] bg-ink-100">
                      <VehicleImage src={row.imageUrl} alt="" className="size-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/inventory/${row.id}`}
                          className="truncate font-medium text-ink-900 hover:text-brand-700"
                        >
                          {row.title}
                        </Link>
                        {row.isFeatured && (
                          <Star className="size-3 shrink-0 fill-warning-600 text-warning-600" />
                        )}
                      </div>
                      <p className="truncate text-[11.5px] text-ink-400">
                        <span className="font-mono">{row.stockId}</span>
                        {row.variant && ` · ${row.variant}`}
                      </p>
                      <p className="text-[11.5px] text-ink-400">
                        {formatKm(row.kmDriven)} · {row.fuelType} · {row.transmission}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{row.branchName}</Td>
                <Td align="right" className="font-semibold text-ink-900 tabular-nums">
                  {formatPrice(row.sellingPrice)}
                </Td>
                {showMargin && (
                  <Td align="right">
                    {row.margin ? (
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          row.margin.profit >= 0 ? "text-success-700" : "text-danger-600",
                        )}
                      >
                        {formatPrice(row.margin.profit)}
                        <span className="ml-1 text-[11px] text-ink-400">{row.margin.marginPct}%</span>
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                )}
                <Td align="center">
                  <Badge tone={bucket.tone} size="sm">{row.days}d</Badge>
                </Td>
                <Td align="center" className="tabular-nums">
                  {row.enquiryCount || <span className="text-ink-300">—</span>}
                </Td>
                <Td>
                  <Badge tone={status.tone} dot size="sm">{status.label}</Badge>
                </Td>
                <Td>
                  <RowMenu
                    row={row}
                    canEdit={canEdit}
                    canTransfer={canTransfer}
                    canCreate={canCreate}
                    onStatus={onStatus}
                    onFeature={onFeature}
                    onTransfer={() => setTransferFor(row)}
                  />
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableShell>

      <TransferSheet
        row={transferFor}
        branches={branches}
        onClose={() => setTransferFor(null)}
        onDone={() => {
          setTransferFor(null);
          router.refresh();
        }}
      />
    </>
  );
}

function RowMenu({
  row,
  canEdit,
  canTransfer,
  canCreate,
  onStatus,
  onFeature,
  onTransfer,
}: {
  row: InventoryRow;
  canEdit: boolean;
  canTransfer: boolean;
  canCreate: boolean;
  onStatus: (id: string, status: string) => void;
  onFeature: (id: string) => void;
  onTransfer: () => void;
}) {
  return (
    <Popover
      align="right"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          aria-label="Vehicle actions"
          className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <Link href={`/inventory/${row.id}`} onClick={close}>
            <MenuItem icon={<Eye className="size-4" />}>View details</MenuItem>
          </Link>
          {canEdit && (
            <Link href={`/inventory/${row.id}/edit`} onClick={close}>
              <MenuItem icon={<Pencil className="size-4" />}>Edit</MenuItem>
            </Link>
          )}
          {canEdit && row.status !== "sold" && (
            <>
              <MenuItem
                icon={<Star className={cn("size-4", row.isFeatured && "fill-warning-600 text-warning-600")} />}
                onClick={() => {
                  onFeature(row.id);
                  close();
                }}
              >
                {row.isFeatured ? "Remove from featured" : "Feature on website"}
              </MenuItem>
              <div className="my-1 border-t border-ink-100" />
              {VEHICLE_STATUSES.filter((s) => s !== row.status && s !== "sold").map((s) => (
                <MenuItem
                  key={s}
                  onClick={() => {
                    onStatus(row.id, s);
                    close();
                  }}
                >
                  Mark {VEHICLE_STATUS_META[s].label}
                </MenuItem>
              ))}
            </>
          )}
          {canTransfer && row.status !== "sold" && (
            <>
              <div className="my-1 border-t border-ink-100" />
              <MenuItem
                icon={<ArrowRightLeft className="size-4" />}
                onClick={() => {
                  onTransfer();
                  close();
                }}
              >
                Transfer branch
              </MenuItem>
            </>
          )}
          {canCreate && (
            <MenuItem
              icon={<Copy className="size-4" />}
              onClick={() => {
                close();
                void cloneVehicle(row.id);
              }}
            >
              Duplicate
            </MenuItem>
          )}
        </>
      )}
    </Popover>
  );
}

function TransferSheet({
  row,
  branches,
  onClose,
  onDone,
}: {
  row: InventoryRow | null;
  branches: { id: string; name: string; city: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setTarget("");
    setNote("");
  }, [row?.id]);

  if (!row) return null;
  const options = branches.filter((b) => b.id !== row.branchId);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Transfer to another branch"
      description={`${row.stockId} — ${row.title}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={pending}
            disabled={!target}
            onClick={() =>
              startTransition(async () => {
                const res = await transferVehicle(row.id, target, note);
                if (res.status === "success") {
                  toast.success("Vehicle transferred", res.message);
                  onDone();
                } else {
                  toast.error(res.message ?? "Transfer failed");
                }
              })
            }
          >
            Transfer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-[10px] bg-ink-50 p-3 text-[12.5px] text-ink-500">
          Currently at <span className="font-medium text-ink-800">{row.branchName}</span>. The
          transfer is recorded in the vehicle history.
        </p>
        <Field label="Move to" required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select a branch</option>
            {options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.city}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" hint="Optional — why is it moving?">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function MobileRow({
  row,
  canEdit,
  selected,
  onToggle,
  showMargin,
}: {
  row: InventoryRow;
  canEdit: boolean;
  selected: boolean;
  onToggle: () => void;
  showMargin: boolean;
}) {
  const status = VEHICLE_STATUS_META[row.status as VehicleStatus];
  const bucket = ageingBucket(row.days);

  return (
    <div
      className={cn(
        "flex gap-3 rounded-[12px] border bg-white p-3 transition-colors",
        selected ? "border-brand-400 bg-brand-50/40" : "border-ink-200",
      )}
    >
      {canEdit && (
        <input
          type="checkbox"
          aria-label={`Select ${row.stockId}`}
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 rounded border-ink-300 accent-brand-600"
        />
      )}
      <Link href={`/inventory/${row.id}`} className="flex min-w-0 flex-1 gap-3">
        <div className="relative size-[70px] shrink-0 overflow-hidden rounded-[9px] bg-ink-100">
          <VehicleImage src={row.imageUrl} alt="" className="size-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10.5px] text-ink-400">{row.stockId}</p>
              <p className="line-clamp-1 text-[13.5px] font-semibold text-ink-950">{row.title}</p>
            </div>
            <Badge tone={status.tone} size="sm">{status.label}</Badge>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-500">
            {formatKm(row.kmDriven)} · {row.fuelType} · {row.branchName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-display text-[14px] font-semibold text-ink-950">
              {formatPrice(row.sellingPrice)}
            </span>
            <Badge tone={bucket.tone} size="sm">{row.days}d</Badge>
            {showMargin && row.margin && (
              <Badge tone={row.margin.profit >= 0 ? "success" : "danger"} size="sm">
                {formatPrice(row.margin.profit)}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
