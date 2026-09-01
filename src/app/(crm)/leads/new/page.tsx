import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { NewLeadForm } from "@/components/crm/NewLeadForm";
import { vehicleTitle, formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Add lead" };

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_MANAGE)) redirect("/leads");

  const sp = await searchParams;

  const [branches, staff, vehicles] = await Promise.all([
    db.branch.findMany({
      where: {
        dealerId: user.dealerId,
        isActive: true,
        ...(user.branchIds.length ? { id: { in: user.branchIds } } : {}),
      },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.vehicle.findMany({
      where: {
        dealerId: user.dealerId,
        status: { in: ["available", "reserved", "booked"] },
        ...(user.branchIds.length ? { branchId: { in: user.branchIds } } : {}),
      },
      select: {
        id: true, stockId: true, year: true, make: true, model: true,
        variant: true, sellingPrice: true, branchId: true,
      },
      orderBy: [{ make: "asc" }, { model: "asc" }],
      take: 400,
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/leads"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to leads
      </Link>

      <PageHeader
        title="Add a lead"
        description="For walk-ins and phone enquiries. Website enquiries arrive automatically."
      />

      <NewLeadForm
        branches={branches}
        staff={staff}
        currentUserId={user.id}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: `${vehicleTitle(v)} — ${formatPrice(v.sellingPrice)} (${v.stockId})`,
          branchId: v.branchId,
        }))}
        defaultVehicleId={sp.vehicle}
      />
    </div>
  );
}
