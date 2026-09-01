import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildLeadWhere, leadListSelect, type LeadFilters } from "@/server/leads";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { LeadKanban } from "@/components/crm/LeadKanban";
import { LeadFilterBar } from "@/components/crm/LeadFilterBar";
import type { LeadRow } from "@/components/crm/LeadTable";
import { buildQuery, vehicleTitle } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const filters: LeadFilters = {
    q: one("q"),
    branchId: one("branch"),
    ownerId: one("owner"),
    source: one("source"),
    priority: one("priority"),
  };

  const where = buildLeadWhere(filters, {
    dealerId: user.dealerId,
    allowedBranchIds: user.branchIds.length ? user.branchIds : undefined,
    restrictToOwnerId: can(user, PERMISSIONS.LEADS_VIEW_ALL) ? undefined : user.id,
  });

  // The board shows the working set — closed leads older than 30 days drop off
  // so columns stay readable.
  const cutoff = new Date(Date.now() - 30 * 86400000);

  const [items, branches, staff] = await Promise.all([
    db.lead.findMany({
      where: {
        ...where,
        OR: [
          { stage: { notIn: ["won", "lost", "not_interested"] } },
          { closedAt: { gte: cutoff } },
        ],
      },
      select: leadListSelect,
      orderBy: [{ priority: "asc" }, { lastActivityAt: "desc" }],
      take: 300,
    }),
    db.branch.findMany({
      where: { dealerId: user.dealerId },
      select: { id: true, name: true, city: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: { dealerId: user.dealerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: LeadRow[] = items.map((l) => ({
    id: l.id,
    reference: l.reference,
    stage: l.stage,
    priority: l.priority,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
    lastActivityAt: l.lastActivityAt.toISOString(),
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    customerName: l.customer.name,
    customerPhone: l.customer.phone,
    customerCity: l.customer.city,
    vehicleLabel: l.vehicle ? vehicleTitle(l.vehicle) : null,
    vehiclePrice: l.vehicle?.sellingPrice ?? null,
    branchName: l.branch?.name ?? null,
    ownerName: l.owner?.name ?? null,
    ownerId: l.owner?.id ?? null,
    requirement: l.requirement,
  }));

  const params = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Lead pipeline"
        description={`${rows.length} active leads on the board`}
        actions={
          <>
            <SegmentedTabs
              items={[
                { href: `/leads${buildQuery(params)}`, label: "Table", active: false },
                { href: `/leads/pipeline${buildQuery(params)}`, label: "Pipeline", active: true },
              ]}
            />
            {can(user, PERMISSIONS.LEADS_MANAGE) && (
              <LinkButton href="/leads/new" size="sm">
                <Plus className="size-4" />
                Add lead
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput placeholder="Search the board…" className="min-w-0 flex-1 sm:max-w-xs" />
        <LeadFilterBar
          branches={branches}
          staff={staff}
          showOwnerFilter={can(user, PERMISSIONS.LEADS_VIEW_ALL)}
          showStageFilter={false}
        />
      </div>

      {rows.length ? (
        <>
          <LeadKanban rows={rows} canManage={can(user, PERMISSIONS.LEADS_MANAGE)} />
          <p className="mt-2 text-[12px] text-ink-400">
            Drag a card between columns to change its stage, or use the handle on a card to pick a
            stage from a list.
          </p>
        </>
      ) : (
        <EmptyState
          title="Your pipeline is empty"
          description="Leads appear on the board as soon as an enquiry arrives."
          action={
            can(user, PERMISSIONS.LEADS_MANAGE) ? (
              <LinkButton href="/leads/new">Add a lead</LinkButton>
            ) : null
          }
        />
      )}
    </div>
  );
}
