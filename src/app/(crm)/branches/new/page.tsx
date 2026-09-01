import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { checkLimit } from "@/lib/plan";
import { createBranch } from "@/app/actions/org";
import { BranchForm } from "@/components/crm/BranchForm";
import { PageHeader } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/Toast";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Add branch" };

export default async function NewBranchPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.BRANCHES_MANAGE)) redirect("/branches");

  const [managers, limit] = await Promise.all([
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    checkLimit(user.dealerId, "branches"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/branches"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to branches
      </Link>

      <PageHeader
        title="Add a branch"
        description="Each branch has its own stock, leads, staff and sales figures."
      />

      {!limit.allowed ? (
        <Alert tone="warning" title="Branch limit reached">
          {limit.message} You have {limit.used} of {limit.limit} branches.
          <div className="mt-3">
            <LinkButton href="/settings" size="sm" variant="outline">
              View plan options
            </LinkButton>
          </div>
        </Alert>
      ) : (
        <BranchForm action={createBranch} managers={managers} />
      )}
    </div>
  );
}
