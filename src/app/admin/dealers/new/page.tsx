import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { NewDealerForm } from "@/components/admin/NewDealerForm";

export const metadata: Metadata = { title: "Onboard dealer" };

export default async function NewDealerPage() {
  await requireSuperAdmin();
  const plans = await db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/dealers"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to dealers
      </Link>

      <PageHeader
        title="Onboard a dealership"
        description="Creates the account, subscription, role set, first branch and the owner login."
      />

      <NewDealerForm plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))} />
    </div>
  );
}
