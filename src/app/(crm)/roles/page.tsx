import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { RoleEditor, type RoleRow } from "@/components/crm/RoleEditor";
import { safeJsonParse } from "@/lib/utils";

export const metadata: Metadata = { title: "Roles & permissions" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.ROLES_MANAGE)) redirect("/dashboard");

  const roles = await db.role.findMany({
    where: { dealerId: user.dealerId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: safeJsonParse<string[]>(r.permissions, []),
    userCount: r._count.users,
  }));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Roles & permissions"
        description="Control exactly what each person on your team can see and do."
      />

      <Alert tone="info" title="How permissions work" className="mb-5">
        Every screen and action in the CRM is gated by a permission. The two that matter most
        commercially are <strong>View purchase cost</strong> and <strong>View profit margin</strong> —
        leave those off for sales executives so they can quote a price without seeing what the car
        cost you. Branch access is set per person on the staff screen.
      </Alert>

      <RoleEditor roles={rows} />

      <div className="mt-8 rounded-[12px] border border-ink-200 bg-ink-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-white text-ink-500">
            <ShieldCheck className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-ink-900">Two layers of access</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
              <strong>Roles</strong> decide <em>what</em> someone can do — view inventory, assign
              leads, see margin. <strong>Branch access</strong> decides <em>which records</em> they
              see. A Branch Manager with the Ludhiana branch assigned has full manager powers, but
              only over Ludhiana stock, leads and sales.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
