import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createServiceVisit } from "@/app/actions/service";
import { ServiceVisitForm } from "@/components/crm/ServiceVisitForm";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Book a car in" };
export const dynamic = "force-dynamic";

export default async function NewServiceVisitPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SERVICE_MANAGE)) redirect("/service");

  const [customers, branches, advisors] = await Promise.all([
    db.customer.findMany({
      where: { dealerId: user.dealerId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.branch.findMany({
      where: {
        dealerId: user.dealerId,
        isActive: true,
        ...(user.branchIds.length ? { id: { in: user.branchIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/service"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to service
      </Link>

      <PageHeader
        title="Book a car in"
        description="Opens a job card. When you close it, the customer gets your feedback message."
      />

      <ServiceVisitForm
        action={createServiceVisit}
        customers={customers}
        branches={branches}
        advisors={advisors}
        values={{ assignedToId: user.id }}
      />
    </div>
  );
}
