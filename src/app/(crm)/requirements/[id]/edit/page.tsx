import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateRequirement } from "@/app/actions/requirements";
import { RequirementForm } from "@/components/crm/RequirementForm";
import { PageHeader } from "@/components/ui/primitives";
import { safeJsonParse } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit requirement" };

export default async function EditRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_MANAGE)) redirect("/requirements");

  const { id } = await params;
  const [requirement, branches] = await Promise.all([
    db.customerRequirement.findFirst({
      where: { id, dealerId: user.dealerId },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    }),
    db.branch.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!requirement) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/requirements/${requirement.id}`}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to requirement
      </Link>

      <PageHeader
        title="Edit requirement"
        description={`${requirement.customer.name} · ${requirement.customer.phone}`}
      />

      <RequirementForm
        action={updateRequirement.bind(null, requirement.id)}
        branches={branches}
        customers={[]}
        lockedCustomer={requirement.customer}
        submitLabel="Save changes"
        cancelHref={`/requirements/${requirement.id}`}
        values={{
          customerId: requirement.customerId,
          budgetMin: requirement.budgetMin,
          budgetMax: requirement.budgetMax,
          make: requirement.make,
          model: requirement.model,
          fuelTypes: safeJsonParse<string[]>(requirement.fuelTypes, []),
          transmissions: safeJsonParse<string[]>(requirement.transmissions, []),
          bodyTypes: safeJsonParse<string[]>(requirement.bodyTypes, []),
          yearMin: requirement.yearMin,
          kmMax: requirement.kmMax,
          ownershipMax: requirement.ownershipMax,
          colour: requirement.colour,
          city: requirement.city,
          branchId: requirement.branchId,
          notes: requirement.notes,
          priority: requirement.priority,
          expiresAt: requirement.expiresAt,
        }}
      />
    </div>
  );
}
