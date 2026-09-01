import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateBranch } from "@/app/actions/org";
import { BranchForm } from "@/components/crm/BranchForm";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Edit branch" };

export default async function EditBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.BRANCHES_MANAGE)) redirect("/branches");

  const { id } = await params;
  const [branch, managers] = await Promise.all([
    db.branch.findFirst({ where: { id, dealerId: user.dealerId } }),
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!branch) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/branches"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to branches
      </Link>

      <PageHeader title={`Edit ${branch.name}`} description={`Branch code ${branch.code}`} />

      <BranchForm
        action={updateBranch.bind(null, branch.id)}
        managers={managers}
        submitLabel="Save changes"
        values={{
          name: branch.name,
          code: branch.code,
          addressLine: branch.addressLine,
          city: branch.city,
          state: branch.state,
          pincode: branch.pincode,
          phone: branch.phone,
          whatsapp: branch.whatsapp,
          email: branch.email,
          openingHours: branch.openingHours,
          mapsUrl: branch.mapsUrl,
          managerId: branch.managerId,
          isActive: branch.isActive,
        }}
      />
    </div>
  );
}
