import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KanbanSquare, Download, Plus, Users } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildLeadWhere, leadListSelect, type LeadFilters } from "@/server/leads";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Table";
import { FilterChips, SegmentedTabs } from "@/components/ui/Tabs";
import { LeadTable, type LeadRow } from "@/components/crm/LeadTable";
import { LeadFilterBar } from "@/components/crm/LeadFilterBar";
import { buildQuery, vehicleTitle, startOfDay, endOfDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function LeadsPage({
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
    stage: one("stage"),
    branchId: one("branch"),
    ownerId: one("owner"),
    source: one("source"),
    priority: one("priority"),
    bucket: (one("bucket") ?? undefined) as LeadFilters["bucket"],
    needs: one("needs"),
    page: Math.max(1, Number(one("page") ?? 1)),
  };

  const scope = {
    dealerId: user.dealerId,
    allowedBranchIds: user.branchIds.length ? user.branchIds : undefined,
    restrictToOwnerId: can(user, PERMISSIONS.LEADS_VIEW_ALL) ? undefined : user.id,
  };
  const where = buildLeadWhere(filters, scope);

  const [items, total, branches, staff, counts] = await Promise.all([
    db.lead.findMany({
      where,
      select: leadListSelect,
      orderBy: [{ lastActivityAt: "desc" }],
      skip: ((filters.page ?? 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.lead.count({ where }),
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
    Promise.all([
      db.lead.count({ where: buildLeadWhere({ bucket: "open" }, scope) }),
      db.lead.count({ where: buildLeadWhere({ stage: "new" }, scope) }),
      db.lead.count({ where: buildLeadWhere({ bucket: "unassigned" }, scope) }),
      db.lead.count({ where: buildLeadWhere({ bucket: "overdue" }, scope) }),
      db.lead.count({ where: buildLeadWhere({ bucket: "uncontacted" }, scope) }),
      db.lead.count({
        where: {
          ...buildLeadWhere({}, scope),
          createdAt: { gte: startOfDay(), lte: endOfDay() },
        },
      }),
    ]),
  ]);

  const [openCount, newCount, unassignedCount, overdueCount, uncontactedCount, todayCount] = counts;

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

  const chips = [
    { href: `/leads${buildQuery(params, { bucket: undefined, stage: undefined, page: undefined })}`, label: "All", count: total, active: !filters.bucket && !filters.stage },
    { href: `/leads${buildQuery(params, { bucket: "open", stage: undefined, page: undefined })}`, label: "Open", count: openCount, active: filters.bucket === "open" },
    { href: `/leads${buildQuery(params, { stage: "new", bucket: undefined, page: undefined })}`, label: "New", count: newCount, active: filters.stage === "new" },
    { href: `/leads${buildQuery(params, { bucket: "unassigned", stage: undefined, page: undefined })}`, label: "Unassigned", count: unassignedCount, active: filters.bucket === "unassigned" },
    { href: `/leads${buildQuery(params, { bucket: "uncontacted", stage: undefined, page: undefined })}`, label: "No reply yet", count: uncontactedCount, active: filters.bucket === "uncontacted" },
    { href: `/leads${buildQuery(params, { bucket: "overdue", stage: undefined, page: undefined })}`, label: "Overdue", count: overdueCount, active: filters.bucket === "overdue" },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Leads"
        description={
          can(user, PERMISSIONS.LEADS_VIEW_ALL)
            ? `${total} enquiries in view`
            : `${total} leads assigned to you`
        }
        actions={
          <>
            <SegmentedTabs
              items={[
                { href: `/leads${buildQuery(params)}`, label: "Table", active: true },
                { href: `/leads/pipeline${buildQuery(params, { page: undefined })}`, label: "Pipeline", active: false },
              ]}
            />
            {can(user, PERMISSIONS.REPORTS_EXPORT) && (
              <LinkButton href={`/api/export/leads${buildQuery(params)}`} variant="outline" size="sm">
                <Download className="size-4" />
                Export
              </LinkButton>
            )}
            {can(user, PERMISSIONS.LEADS_MANAGE) && (
              <LinkButton href="/leads/new" size="sm">
                <Plus className="size-4" />
                Add lead
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open leads" value={openCount} tone="brand" />
        <StatCard label="New today" value={todayCount} tone="info" />
        <StatCard label="Unassigned" value={unassignedCount} tone={unassignedCount ? "warning" : "neutral"} />
        <StatCard label="Overdue follow-ups" value={overdueCount} tone={overdueCount ? "danger" : "neutral"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput placeholder="Search name, phone, reference…" className="min-w-0 flex-1 sm:max-w-sm" />
        <LeadFilterBar
          branches={branches}
          staff={staff}
          showOwnerFilter={can(user, PERMISSIONS.LEADS_VIEW_ALL)}
        />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {rows.length ? (
        <>
          <LeadTable
            rows={rows}
            staff={staff}
            canAssign={can(user, PERMISSIONS.LEADS_ASSIGN)}
            canManage={can(user, PERMISSIONS.LEADS_MANAGE)}
          />
          <Pagination
            page={filters.page ?? 1}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/leads"
            params={params}
          />
        </>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No leads here"
          description={
            total === 0
              ? "Enquiries from your website, WhatsApp and walk-ins will appear here automatically."
              : "Try a different filter or clear your search."
          }
          action={
            can(user, PERMISSIONS.LEADS_MANAGE) ? (
              <LinkButton href="/leads/new">Add a lead manually</LinkButton>
            ) : null
          }
        />
      )}

      <div className="mt-6 flex justify-center lg:hidden">
        <LinkButton href="/leads/pipeline" variant="outline" size="sm">
          <KanbanSquare className="size-4" />
          Switch to pipeline view
        </LinkButton>
      </div>
    </div>
  );
}
