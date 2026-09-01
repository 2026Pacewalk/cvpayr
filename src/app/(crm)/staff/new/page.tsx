import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { checkLimit } from "@/lib/plan";
import { createStaff } from "@/app/actions/org";
import { StaffForm } from "@/components/crm/StaffForm";
import { PageHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { safeJsonParse } from "@/lib/utils";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.STAFF_MANAGE)) redirect("/staff");

  const [roles, branches, limit] = await Promise.all([
    db.role.findMany({ where: { dealerId: user.dealerId }, orderBy: { name: "asc" } }),
    db.branch.findMany({
      where: { dealerId: user.dealerId },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
    checkLimit(user.dealerId, "users"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/staff"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to staff
      </Link>

      <PageHeader
        title="Add a staff member"
        description="Give them a role, and optionally restrict them to specific branches."
      />

      {!limit.allowed ? (
        <Alert tone="warning" title="Staff limit reached">
          {limit.message} You have {limit.used} of {limit.limit} accounts.
        </Alert>
      ) : (
        <StaffForm
          action={createStaff}
          branches={branches}
          roles={roles.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            permissions: safeJsonParse<string[]>(r.permissions, []),
          }))}
        />
      )}
    </div>
  );
}
