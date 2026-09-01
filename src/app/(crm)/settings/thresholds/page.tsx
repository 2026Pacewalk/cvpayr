import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Info } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getAttentionSettings } from "@/server/attention";
import { PageHeader, Card } from "@/components/ui/primitives";
import { ThresholdForm } from "@/components/crm/ThresholdForm";

export const metadata: Metadata = { title: "Response & ageing thresholds" };
export const dynamic = "force-dynamic";

export default async function ThresholdsPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SETTINGS_MANAGE)) redirect("/settings");

  const values = await getAttentionSettings(user.dealerId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>

      <PageHeader
        title="Response & ageing thresholds"
        description="What counts as late, at this dealership."
      />

      <Card className="mb-5 border-brand-200 bg-brand-50/40">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-white text-brand-600">
            <Info className="size-4" />
          </span>
          <p className="text-[13px] leading-relaxed text-ink-700">
            These numbers are the single source of truth. The action centre, the response
            queue on your dashboard and the scheduled reminders that go out when nobody has
            the CRM open all read from here — change one and everything moves together.
          </p>
        </div>
      </Card>

      <ThresholdForm values={values} />
    </div>
  );
}
