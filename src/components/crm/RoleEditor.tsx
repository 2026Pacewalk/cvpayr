"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, Pencil, Trash2, Lock, AlertTriangle } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Sheet, ConfirmDialog } from "@/components/ui/Overlay";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { useToast, Alert } from "@/components/ui/Toast";
import { saveRole, deleteRole } from "@/app/actions/org";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
};

export function RoleEditor({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<RoleRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<RoleRow | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Create role
        </Button>
      </div>

      {roles.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {roles.map((role) => {
            const isOwner = role.key === "dealer_owner";
            const sensitive = role.permissions.filter((p) =>
              ["inventory.view_cost", "inventory.view_margin", "staff.manage", "roles.manage", "settings.manage"].includes(p),
            );
            return (
              <Card key={role.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ink-950">{role.name}</h3>
                      {role.isSystem && <Badge tone="neutral" size="sm">Built-in</Badge>}
                      {isOwner && (
                        <Badge tone="warning" size="sm">
                          <Lock className="size-3" />
                          Full access
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                        {role.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditing(role)}
                      disabled={isOwner}
                      aria-label={`Edit ${role.name}`}
                      className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
                    >
                      <Pencil className="size-4" />
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => setDeleting(role)}
                        aria-label={`Delete ${role.name}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
                  <Badge tone="brand" size="sm">
                    {role.permissions.length} permissions
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {role.userCount} {role.userCount === 1 ? "person" : "people"}
                  </Badge>
                  {sensitive.length > 0 && (
                    <Badge tone="warning" size="sm">
                      <AlertTriangle className="size-3" />
                      {sensitive.length} sensitive
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ShieldCheck className="size-6" />}
          title="No roles configured"
          description="Create a role to control what your staff can see and do."
        />
      )}

      {editing && (
        <RoleSheet
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        loading={pending}
        title="Delete this role?"
        confirmLabel="Delete role"
        message={
          deleting
            ? `${deleting.name} will be removed. Staff still using it must be moved to another role first.`
            : ""
        }
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const res = await deleteRole(deleting.id);
            if (res.status === "success") {
              toast.success(res.message ?? "Role deleted");
              setDeleting(null);
              router.refresh();
            } else {
              toast.error(res.message ?? "Could not delete");
            }
          })
        }
      />
    </>
  );
}

function RoleSheet({
  role,
  onClose,
  onSaved,
}: {
  role: RoleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<string[]>(role?.permissions ?? []);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every((k) => selected.includes(k));
    setSelected((s) => (allOn ? s.filter((k) => !keys.includes(k)) : [...new Set([...s, ...keys])]));
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : "Create a role"}
      description="Tick exactly what this role should be able to do."
      size="lg"
    >
      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const res = await saveRole({
              roleId: role?.id,
              name: String(fd.get("name") ?? "").trim(),
              description: String(fd.get("description") ?? "").trim() || undefined,
              permissions: selected,
            });
            if (res.status === "success") {
              toast.success(res.message ?? "Saved");
              onSaved();
            } else {
              setError(res.message ?? "Could not save");
            }
          });
        }}
        className="space-y-5"
      >
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" required>
            <Input name="name" required defaultValue={role?.name} placeholder="e.g. Showroom Host" />
          </Field>
          <Field label="Description">
            <Input
              name="description"
              defaultValue={role?.description ?? ""}
              placeholder="What this role is for"
            />
          </Field>
        </div>

        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => {
            const keys = group.items.map((i) => i.key as string);
            const allOn = keys.every((k) => selected.includes(k));
            const someOn = keys.some((k) => selected.includes(k));

            return (
              <div key={group.group} className="rounded-[12px] border border-ink-200">
                <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                  <div>
                    <p className="text-[13px] font-semibold text-ink-900">{group.group}</p>
                    <p className="text-[11.5px] text-ink-500">{group.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroup(keys)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      allOn
                        ? "bg-brand-600 text-white"
                        : someOn
                          ? "bg-brand-50 text-brand-700"
                          : "bg-white text-ink-500 ring-1 ring-ink-200 ring-inset",
                    )}
                  >
                    {allOn ? "All on" : someOn ? "Some" : "Select all"}
                  </button>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Checkbox
                      key={item.key}
                      checked={selected.includes(item.key)}
                      onChange={() => toggle(item.key)}
                      label={
                        <span className="flex items-center gap-1.5">
                          {item.label}
                          {item.sensitive && (
                            <span className="rounded bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700">
                              Sensitive
                            </span>
                          )}
                        </span>
                      }
                      description={item.hint}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-5 py-3">
          <p className="text-[12.5px] text-ink-500">
            <span className="font-semibold text-ink-900">{selected.length}</span> permissions selected
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={pending}>
              {role ? "Save role" : "Create role"}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
