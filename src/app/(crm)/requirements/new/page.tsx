import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createRequirement } from "@/app/actions/requirements";
import { RequirementForm } from "@/components/crm/RequirementForm";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "New requirement" };

export default async function NewRequirementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_MANAGE)) redirect("/requirements");

  const sp = await searchParams;

  const [branches, customers, locked] = await Promise.all([
    db.branch.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.customer.findMany({
      where: { dealerId: user.dealerId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    sp.customer
      ? db.customer.findFirst({
          where: { id: sp.customer, dealerId: user.dealerId },
          select: { id: true, name: true, phone: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/requirements"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to requirements
      </Link>

      <PageHeader
        title="Record what a customer wants"
        description="Save the brief even when nothing in stock matches. New arrivals are checked against it automatically."
      />

      <RequirementForm
        action={createRequirement}
        branches={branches}
        customers={customers}
        lockedCustomer={locked ?? undefined}
      />
    </div>
  );
}
