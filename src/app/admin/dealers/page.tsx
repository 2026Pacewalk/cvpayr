import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, ExternalLink } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Badge } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/Tabs";
import { TableShell, Th, Td, Tr, Pagination } from "@/components/ui/Table";
import { formatDate, relativeTime, buildQuery } from "@/lib/utils";
import { DEALER_STATUSES } from "@/lib/constants";

export const metadata: Metadata = { title: "Dealers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminDealersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();

  const sp = await searchParams;
  const q = sp.q?.trim();
  const status = sp.status;
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { slug: { contains: q } },
            { city: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [dealers, total, statusCounts] = await Promise.all([
    db.dealer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        subscription: { include: { plan: { select: { name: true } } } },
        _count: { select: { branches: true, users: true, vehicles: true, leads: true } },
      },
    }),
    db.dealer.count({ where }),
    db.dealer.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((s, x) => s + x._count._all, 0);

  const chips = [
    { href: `/admin/dealers${buildQuery(sp, { status: undefined, page: undefined })}`, label: "All", count: allCount, active: !status },
    ...DEALER_STATUSES.map((s) => ({
      href: `/admin/dealers${buildQuery(sp, { status: s.value, page: undefined })}`,
      label: s.label,
      count: countFor(s.value),
      active: status === s.value,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Dealerships"
        description={`${allCount} accounts on the platform`}
        actions={
          <LinkButton href="/admin/dealers/new" size="sm">
            <Plus className="size-4" />
            Onboard dealer
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput placeholder="Search name, URL, city…" className="min-w-0 flex-1 sm:max-w-sm" />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {dealers.length ? (
        <>
          <TableShell
            mobile={
              <>
                {dealers.map((d) => {
                  const meta = DEALER_STATUSES.find((s) => s.value === d.status);
                  return (
                    <Link
                      key={d.id}
                      href={`/admin/dealers/${d.id}`}
                      className="block rounded-[12px] border border-ink-200 bg-white p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-ink-950">{d.name}</p>
                          <p className="font-mono text-[11px] text-ink-400">/d/{d.slug}</p>
                        </div>
                        <Badge tone={meta?.tone ?? "neutral"} size="sm" dot>
                          {meta?.label ?? d.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                        <span>{d.subscription?.plan.name ?? "No plan"}</span>
                        <span>· {d._count.vehicles} vehicles</span>
                        <span>· {d._count.users} users</span>
                        <span>· {d._count.branches} branches</span>
                      </div>
                    </Link>
                  );
                })}
              </>
            }
          >
            <thead>
              <tr>
                <Th>Dealership</Th>
                <Th>Plan</Th>
                <Th align="center">Branches</Th>
                <Th align="center">Users</Th>
                <Th align="center">Vehicles</Th>
                <Th align="center">Leads</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => {
                const meta = DEALER_STATUSES.find((s) => s.value === d.status);
                return (
                  <Tr key={d.id}>
                    <Td>
                      <Link
                        href={`/admin/dealers/${d.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {d.name}
                      </Link>
                      <p className="font-mono text-[11px] text-ink-400">/d/{d.slug}</p>
                    </Td>
                    <Td>
                      {d.subscription ? (
                        <Badge tone="brand" size="sm">{d.subscription.plan.name}</Badge>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </Td>
                    <Td align="center" className="tabular-nums">{d._count.branches}</Td>
                    <Td align="center" className="tabular-nums">{d._count.users}</Td>
                    <Td align="center" className="tabular-nums">{d._count.vehicles}</Td>
                    <Td align="center" className="tabular-nums">{d._count.leads}</Td>
                    <Td className="whitespace-nowrap text-[12.5px]">
                      <span title={formatDate(d.createdAt)}>{relativeTime(d.createdAt)}</span>
                    </Td>
                    <Td>
                      <Badge tone={meta?.tone ?? "neutral"} size="sm" dot>
                        {meta?.label ?? d.status}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={`/d/${d.slug}`}
                        target="_blank"
                        aria-label={`Open ${d.name} public site`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/dealers"
            params={sp}
          />
        </>
      ) : (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No dealerships match"
          description="Adjust the filter, or onboard a new dealership."
          action={<LinkButton href="/admin/dealers/new">Onboard a dealer</LinkButton>}
        />
      )}
    </div>
  );
}
