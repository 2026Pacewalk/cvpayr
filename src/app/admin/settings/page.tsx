import type { Metadata } from "next";
import { Settings, Database, ShieldCheck, Bell, Globe } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, DataList } from "@/components/ui/primitives";
import { ROLE_TEMPLATES, ALL_PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Platform settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const user = await requireSuperAdmin();

  const [admins, counts] = await Promise.all([
    db.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    Promise.all([
      db.dealer.count(),
      db.vehicle.count(),
      db.lead.count(),
      db.customer.count(),
      db.sale.count(),
      db.auditLog.count(),
      db.notification.count(),
    ]),
  ]);

  const [dealers, vehicles, leads, customers, sales, auditLogs, notifications] = counts;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Platform settings"
        description="Configuration that applies to every tenant."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Platform administrators"
            description="Accounts with cross-tenant access"
            icon={<ShieldCheck className="size-4" />}
          />
          <ul className="mt-4 divide-y divide-ink-100">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink-900">
                    {a.name}
                    {a.id === user.id && <span className="ml-2 text-[11.5px] text-brand-700">You</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-400">{a.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={a.isActive ? "success" : "neutral"} size="sm" dot>
                    {a.isActive ? "Active" : "Disabled"}
                  </Badge>
                  <p className="mt-1 text-[11px] text-ink-400">
                    {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never signed in"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Data footprint"
            description="Total records across all tenants"
            icon={<Database className="size-4" />}
          />
          <div className="mt-4">
            <DataList
              columns={4}
              items={[
                { label: "Dealerships", value: dealers },
                { label: "Vehicles", value: vehicles },
                { label: "Leads", value: leads },
                { label: "Customers", value: customers },
                { label: "Sales", value: sales },
                { label: "Audit entries", value: auditLogs },
                { label: "Notifications", value: notifications },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Role templates"
            description="Seeded into every new dealership at onboarding"
            icon={<ShieldCheck className="size-4" />}
          />
          <ul className="mt-4 space-y-3">
            {ROLE_TEMPLATES.map((r) => (
              <li key={r.key} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-semibold text-ink-900">{r.name}</p>
                  <Badge tone="brand" size="sm">
                    {r.key === "dealer_owner" ? ALL_PERMISSIONS.length : r.permissions.length} permissions
                  </Badge>
                  <code className="font-mono text-[11px] text-ink-400">{r.key}</code>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-500">{r.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-[10px] bg-ink-50 p-3.5 text-[12.5px] leading-relaxed text-ink-500">
            Dealers can edit these templates for their own account or create custom roles. Changes
            never affect other tenants.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Notification transports"
            description="Channels available to the notification pipeline"
            icon={<Bell className="size-4" />}
          />
          <div className="mt-4 space-y-3">
            {[
              { name: "In-app", status: "Active", tone: "success" as const, note: "Notification centre in the CRM" },
              { name: "Email", status: "Not configured", tone: "neutral" as const, note: "Add a provider (e.g. Resend) to enable" },
              { name: "WhatsApp", status: "Not configured", tone: "neutral" as const, note: "Requires a Business API provider" },
              { name: "SMS", status: "Not configured", tone: "neutral" as const, note: "Requires an SMS gateway" },
              { name: "Push", status: "Not configured", tone: "neutral" as const, note: "Web push keys not set" },
            ].map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-[13.5px] font-medium text-ink-900">{t.name}</p>
                  <p className="text-[12px] text-ink-500">{t.note}</p>
                </div>
                <Badge tone={t.tone} size="sm" dot>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Domains"
            description="How dealer showrooms are addressed"
            icon={<Globe className="size-4" />}
          />
          <div className="mt-4 space-y-3 text-[13px]">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3">
              <div>
                <p className="font-medium text-ink-900">Path routing</p>
                <code className="font-mono text-[12px] text-ink-500">/d/&lt;slug&gt;</code>
              </div>
              <Badge tone="success" size="sm" dot>Active</Badge>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3">
              <div>
                <p className="font-medium text-ink-900">Subdomain routing</p>
                <code className="font-mono text-[12px] text-ink-500">&lt;slug&gt;.carvyapar.in</code>
              </div>
              <Badge tone="neutral" size="sm">Requires DNS</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink-900">Custom domains</p>
                <code className="font-mono text-[12px] text-ink-500">dealer-owned domain</code>
              </div>
              <Badge tone="neutral" size="sm">Enterprise plan</Badge>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-500">
            The dealer model already carries a unique <code className="font-mono">customDomain</code>{" "}
            field, so enabling either routing mode is a hosting change rather than a schema change.
          </p>
        </Card>
      </div>
    </div>
  );
}
