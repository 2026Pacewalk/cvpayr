import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getTemplates } from "@/server/whatsapp";
import { PageHeader, Card, StatCard } from "@/components/ui/primitives";
import { TemplateManager, type TemplateRow } from "@/components/crm/TemplateManager";

export const metadata: Metadata = { title: "WhatsApp templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SETTINGS_VIEW)) redirect("/dashboard");

  const templates = await getTemplates(user.dealerId, { includeInactive: true });

  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    category: t.category,
    body: t.body,
    isActive: t.isActive,
    isSystem: t.isSystem,
    useCount: t.useCount,
  }));

  const totalSends = rows.reduce((s, t) => s + t.useCount, 0);
  const mostUsed = [...rows].sort((a, b) => b.useCount - a.useCount)[0];

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>

      <PageHeader
        title="WhatsApp templates"
        description="Write the message once. Every salesperson sends the same thing, with the customer's details filled in."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Templates"
          value={rows.length}
          sub={`${rows.filter((t) => t.isActive).length} active`}
          tone="brand"
          icon={<MessageCircle className="size-4" />}
        />
        <StatCard label="Messages sent" value={totalSends} tone="success" />
        <StatCard
          label="Most used"
          value={mostUsed?.useCount ? mostUsed.name : "—"}
          sub={mostUsed?.useCount ? `${mostUsed.useCount} sends` : "No sends yet"}
          tone="purple"
        />
        <StatCard label="Custom templates" value={rows.filter((t) => !t.isSystem).length} tone="info" />
      </div>

      <TemplateManager templates={rows} canManage={can(user, PERMISSIONS.SETTINGS_MANAGE)} />

      <Card className="mt-6">
        <h2 className="text-[14px] font-semibold text-ink-900">How templates are used</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-600">
          <li>
            <strong>On a lead.</strong> The WhatsApp button opens a picker with every template that
            makes sense for that lead — vehicle messages only appear when a car is attached, the
            test-drive confirmation only once one is booked.
          </li>
          <li>
            <strong>Filled server-side.</strong> Customer name, vehicle, price, branch, link and
            dates are merged before the salesperson sees the preview, so the message they read is
            the message the customer gets.
          </li>
          <li>
            <strong>Editable before sending.</strong> Templates are a starting point, not a
            straitjacket — anyone can adjust the wording for that one conversation.
          </li>
          <li>
            <strong>Logged automatically.</strong> Sending records the touch on the lead timeline
            and stamps the first-response time used in the SLA reports.
          </li>
        </ul>
      </Card>
    </div>
  );
}
