import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateStaff } from "@/app/actions/org";
import { StaffForm } from "@/components/crm/StaffForm";
import { PageHeader } from "@/components/ui/primitives";
import { safeJsonParse } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit staff" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.STAFF_MANAGE)) redirect("/staff");

  const { id } = await params;
  const [staff, roles, branches] = await Promise.all([
    db.user.findFirst({
      where: { id, dealerId: user.dealerId },
      include: { branches: { select: { branchId: true } } },
    }),
    db.role.findMany({ where: { dealerId: user.dealerId }, orderBy: { name: "asc" } }),
    db.branch.findMany({
      where: { dealerId: user.dealerId },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!staff) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/staff"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to staff
      </Link>

      <PageHeader title={`Edit ${staff.name}`} description={staff.email} />

      <StaffForm
        action={updateStaff.bind(null, staff.id)}
        isEdit
        submitLabel="Save changes"
        branches={branches}
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          permissions: safeJsonParse<string[]>(r.permissions, []),
        }))}
        values={{
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          designation: staff.designation,
          roleId: staff.roleId ?? undefined,
          isActive: staff.isActive,
          branchIds: staff.branches.map((b) => b.branchId),
        }}
      />
    </div>
  );
}
