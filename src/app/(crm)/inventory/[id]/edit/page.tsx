import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can, canSeeCost, isBranchAllowed } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { resolvePlan } from "@/lib/plan";
import { getDealerBranches } from "@/server/dealer";
import { getVehicleDetail, vehicleFeatures } from "@/server/inventory";
import { updateVehicle } from "@/app/actions/vehicles";
import { VehicleForm } from "@/components/crm/VehicleForm";
import { PageHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { vehicleTitle } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireDealerUser();
  const vehicle = await getVehicleDetail(user.dealerId, id);
  return { title: vehicle ? `Edit ${vehicle.stockId}` : "Edit vehicle" };
}

export default async function EditVehiclePage({ params, searchParams }: Props) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.INVENTORY_EDIT)) redirect("/inventory");

  const { id } = await params;
  const sp = await searchParams;
  const vehicle = await getVehicleDetail(user.dealerId, id);
  if (!vehicle) notFound();
  if (!isBranchAllowed(user, vehicle.branchId)) redirect("/inventory");

  const [branches, plan] = await Promise.all([
    getDealerBranches(user.dealerId, true),
    resolvePlan(user.dealerId),
  ]);

  const allowedBranches = branches
    .filter((b) => !user.branchIds.length || user.branchIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name, city: b.city }));

  const photos = vehicle.images.filter((i) => i.kind === "photo");
  const coverIndex = Math.max(0, photos.findIndex((i) => i.isCover));
  const youtube = vehicle.images.find((i) => i.kind === "youtube");

  const action = updateVehicle.bind(null, vehicle.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/inventory/${vehicle.id}`}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to vehicle
      </Link>

      <PageHeader
        title={`Edit ${vehicle.stockId}`}
        description={vehicleTitle(vehicle)}
      />

      {sp.cloned && (
        <Alert tone="info" title="Duplicated vehicle" className="mb-5">
          This is a copy saved as a draft. Update the registration number, photos and price, then
          publish it.
        </Alert>
      )}

      <VehicleForm
        action={action}
        branches={allowedBranches}
        canSeeCost={canSeeCost(user)}
        maxImages={plan.limits.maxImagesPerVehicle}
        submitLabel="Save changes"
        cancelHref={`/inventory/${vehicle.id}`}
        values={{
          id: vehicle.id,
          branchId: vehicle.branchId,
          stockId: vehicle.stockId,
          registrationNumber: vehicle.registrationNumber,
          make: vehicle.make,
          model: vehicle.model,
          variant: vehicle.variant,
          year: vehicle.year,
          registrationYear: vehicle.registrationYear,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          bodyType: vehicle.bodyType,
          colour: vehicle.colour,
          ownership: vehicle.ownership,
          kmDriven: vehicle.kmDriven,
          registrationState: vehicle.registrationState,
          rto: vehicle.rto,
          insuranceStatus: vehicle.insuranceStatus,
          insuranceValidTill: vehicle.insuranceValidTill,
          fitnessValidTill: vehicle.fitnessValidTill,
          pucValidTill: vehicle.pucValidTill,
          sellingPrice: vehicle.sellingPrice,
          originalPrice: vehicle.originalPrice,
          negotiable: vehicle.negotiable,
          minAcceptablePrice: vehicle.minAcceptablePrice,
          purchasePrice: vehicle.purchasePrice,
          refurbishmentCost: vehicle.refurbishmentCost,
          conditionRating: vehicle.conditionRating,
          serviceHistory: vehicle.serviceHistory,
          accidental: vehicle.accidental,
          floodDamaged: vehicle.floodDamaged,
          repaintedPanels: vehicle.repaintedPanels,
          tyreCondition: vehicle.tyreCondition,
          batteryCondition: vehicle.batteryCondition,
          engineCondition: vehicle.engineCondition,
          interiorCondition: vehicle.interiorCondition,
          exteriorCondition: vehicle.exteriorCondition,
          numberOfKeys: vehicle.numberOfKeys,
          serviceRecordsAvailable: vehicle.serviceRecordsAvailable,
          rcAvailable: vehicle.rcAvailable,
          insuranceAvailable: vehicle.insuranceAvailable,
          description: vehicle.description,
          internalNotes: vehicle.internalNotes,
          status: vehicle.status,
          isFeatured: vehicle.isFeatured,
          features: vehicleFeatures(vehicle),
          imageUrls: photos.map((i) => i.url),
          coverIndex,
          youtubeUrl: youtube?.url ?? "",
        }}
      />
    </div>
  );
}
