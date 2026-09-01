import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeCost } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { checkLimit, resolvePlan } from "@/lib/plan";
import { getDealerBranches } from "@/server/dealer";
import { nextStockId } from "@/server/inventory";
import { createVehicle } from "@/app/actions/vehicles";
import { VehicleForm } from "@/components/crm/VehicleForm";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Add vehicle" };

export default async function NewVehiclePage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.INVENTORY_CREATE)) redirect("/inventory");

  const [branches, limit, plan, suggestedStockId] = await Promise.all([
    getDealerBranches(user.dealerId, true),
    checkLimit(user.dealerId, "vehicles"),
    resolvePlan(user.dealerId),
    nextStockId(user.dealerId),
  ]);

  const allowedBranches = branches
    .filter((b) => !user.branchIds.length || user.branchIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name, city: b.city }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/inventory"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to inventory
      </Link>

      <PageHeader
        title="Add a vehicle"
        description="Fill what you know now — you can save as a draft and finish later."
      />

      {!limit.allowed && (
        <Alert tone="warning" title="Vehicle limit reached" className="mb-5">
          {limit.message} You currently have {limit.used} of {limit.limit} vehicles.
        </Alert>
      )}

      {allowedBranches.length === 0 ? (
        <EmptyState
          title="No branch available"
          description="Vehicles belong to a branch. Create one first, then add stock to it."
          action={<LinkButton href="/branches/new">Create a branch</LinkButton>}
        />
      ) : (
        <VehicleForm
          action={createVehicle}
          branches={allowedBranches}
          canSeeCost={canSeeCost(user)}
          maxImages={plan.limits.maxImagesPerVehicle}
          suggestedStockId={suggestedStockId}
          submitLabel="Save vehicle"
          values={{ status: "available", negotiable: true, rcAvailable: true, serviceRecordsAvailable: true }}
        />
      )}
    </div>
  );
}
