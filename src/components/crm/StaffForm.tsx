"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { UserPlus, ShieldCheck, Building2, KeyRound } from "lucide-react";
import type { OrgActionState } from "@/app/actions/org";
import { Field, Input, Select, Checkbox, Switch, FormGrid, FormSection } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/primitives";
import { PERMISSION_LABELS } from "@/lib/permissions";

export type StaffFormValues = {
  name?: string;
  email?: string;
  phone?: string | null;
  designation?: string | null;
  roleId?: string;
  isActive?: boolean;
  branchIds?: string[];
};

export function StaffForm({
  action,
  roles,
  branches,
  values = {},
  submitLabel = "Add staff member",
  isEdit,
}: {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  roles: { id: string; name: string; description: string | null; permissions: string[] }[];
  branches: { id: string; name: string; city: string }[];
  values?: StaffFormValues;
  submitLabel?: string;
  isEdit?: boolean;
}) {
  const [state, formAction] = useActionState<OrgActionState, FormData>(action, { status: "idle" });
  const [roleId, setRoleId] = React.useState(values.roleId ?? roles[0]?.id ?? "");

  const selectedRole = roles.find((r) => r.id === roleId);
  const sensitive = (selectedRole?.permissions ?? []).filter((p) =>
    ["inventory.view_cost", "inventory.view_margin", "staff.manage", "roles.manage", "settings.manage"].includes(p),
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Could not save">{state.message}</Alert>
      )}

      <FormSection title="Person" icon={<UserPlus className="size-4" />}>
        <FormGrid columns={2}>
          <Field label="Full name" required error={state.fieldErrors?.name} htmlFor="name">
            <Input id="name" name="name" required defaultValue={values.name} placeholder="e.g. Priya Malhotra" />
          </Field>
          <Field label="Email" required hint="Used to sign in" error={state.fieldErrors?.email} htmlFor="email">
            <Input id="email" name="email" type="email" required defaultValue={values.email} placeholder="priya@dealership.in" />
          </Field>
          <Field label="Mobile" htmlFor="phone">
            <Input id="phone" name="phone" prefix="+91" inputMode="numeric" defaultValue={values.phone ?? ""} />
          </Field>
          <Field label="Designation" htmlFor="designation">
            <Input id="designation" name="designation" defaultValue={values.designation ?? ""} placeholder="Senior Sales Executive" />
          </Field>
        </FormGrid>
        <div className="mt-4 border-t border-ink-100 pt-4">
          <Switch
            name="isActive"
            defaultChecked={values.isActive ?? true}
            label="Account is active"
            description="Deactivated staff cannot sign in but their history is preserved."
          />
        </div>
      </FormSection>

      <FormSection
        title="Role & permissions"
        description="Roles decide what this person can see and do."
        icon={<ShieldCheck className="size-4" />}
      >
        <Field label="Role" required htmlFor="roleId">
          <Select id="roleId" name="roleId" required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>

        {selectedRole && (
          <div className="mt-4 rounded-[10px] border border-ink-200 bg-ink-50 p-4">
            <p className="text-[13px] text-ink-600">{selectedRole.description}</p>
            <p className="mt-3 text-[12px] font-medium text-ink-500">
              {selectedRole.permissions.length} permission
              {selectedRole.permissions.length === 1 ? "" : "s"} granted
            </p>
            {sensitive.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {sensitive.map((p) => (
                  <Badge key={p} tone="warning" size="sm">
                    {PERMISSION_LABELS[p] ?? p}
                  </Badge>
                ))}
              </div>
            )}
            <Link href="/roles" className="mt-3 inline-block text-[12.5px] font-medium text-brand-700 hover:underline">
              Edit roles and permissions
            </Link>
          </div>
        )}
      </FormSection>

      <FormSection
        title="Branch access"
        description="Leave everything unticked to give access to all branches."
        icon={<Building2 className="size-4" />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {branches.map((b) => (
            <Checkbox
              key={b.id}
              name="branchIds"
              value={b.id}
              defaultChecked={values.branchIds?.includes(b.id)}
              label={b.name}
              description={b.city}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title={isEdit ? "Reset password" : "Password"}
        description={
          isEdit
            ? "Leave blank to keep the current password."
            : "They can change it after signing in."
        }
        icon={<KeyRound className="size-4" />}
      >
        <Field label="Password" hint="Minimum 8 characters recommended" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="text"
            defaultValue={isEdit ? "" : "password123"}
            placeholder={isEdit ? "Leave blank to keep current" : "password123"}
          />
        </Field>
      </FormSection>

      <div className="flex items-center gap-2.5">
        <Link
          href="/staff"
          className="inline-flex h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <SubmitButton size="lg" className="flex-1 sm:flex-none sm:px-8" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
