import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Target, Plus, Phone, MessageCircle, Sparkles } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { matchVehiclesForRequirement } from "@/server/matching";
import { PageHeader, EmptyState, StatCard, Card, Badge, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/Tabs";
import { Pagination } from "@/components/ui/Table";
import { Alert } from "@/components/ui/Toast";
import {
  formatPrice, relativeTime, telHref, whatsappHref, buildQuery, safeJsonParse,
} from "@/lib/utils";
import { REQUIREMENT_STATUS_META, LEAD_PRIORITIES } from "@/lib/constants";

export const metadata: Metadata = { title: "Customer requirements" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.LEADS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const status = sp.status;
  const priority = sp.priority;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page ?? 1));

  const branchScope = user.branchIds.length
    ? { OR: [{ branchId: { in: user.branchIds } }, { branchId: null }] }
    : {};

  const where = {
    dealerId: user.dealerId,
    ...branchScope,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(q
      ? {
          OR: [
            { customer: { name: { contains: q } } },
            { customer: { phone: { contains: q } } },
            { make: { contains: q } },
            { model: { contains: q } },
            { notes: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total, counts] = await Promise.all([
    db.customerRequirement.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, name: true, phone: true, city: true } },
        branch: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.customerRequirement.count({ where }),
    Promise.all([
      db.customerRequirement.count({ where: { dealerId: user.dealerId, ...branchScope } }),
      db.customerRequirement.count({ where: { dealerId: user.dealerId, ...branchScope, status: "open" } }),
      db.customerRequirement.count({ where: { dealerId: user.dealerId, ...branchScope, status: "matched" } }),
      db.customerRequirement.count({ where: { dealerId: user.dealerId, ...branchScope, priority: "high", status: { in: ["open", "matched"] } } }),
      db.customerRequirement.count({ where: { dealerId: user.dealerId, ...branchScope, status: "fulfilled" } }),
    ]),
  ]);

  const [allCount, openCount, matchedCount, highCount, fulfilledCount] = counts;

  // Live match count per requirement — the number that makes this screen useful.
  const withMatches = await Promise.all(
    items.map(async (r) => ({
      ...r,
      matchCount: ["open", "matched"].includes(r.status)
        ? (await matchVehiclesForRequirement(r, user.dealerId, { limit: 99 })).length
        : 0,
    })),
  );

  const chips = [
    { href: `/requirements${buildQuery(sp, { status: undefined, page: undefined })}`, label: "All", count: allCount, active: !status },
    { href: `/requirements${buildQuery(sp, { status: "open", page: undefined })}`, label: "Open", count: openCount, active: status === "open" },
    { href: `/requirements${buildQuery(sp, { status: "matched", page: undefined })}`, label: "Matched", count: matchedCount, active: status === "matched" },
    { href: `/requirements${buildQuery(sp, { status: "fulfilled", page: undefined })}`, label: "Fulfilled", count: fulfilledCount, active: status === "fulfilled" },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Customer requirements"
        description="What your customers are looking for — checked automatically against every car you add."
        actions={
          can(user, PERMISSIONS.LEADS_MANAGE) ? (
            <LinkButton href="/requirements/new" size="sm">
              <Plus className="size-4" />
              Record a requirement
            </LinkButton>
          ) : null
        }
      />

      {sp.deleted && <Alert tone="info" title="Requirement deleted" className="mb-4" />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open briefs" value={openCount} tone="brand" icon={<Target className="size-4" />} />
        <StatCard label="With stock matched" value={matchedCount} tone="success" icon={<Sparkles className="size-4" />} />
        <StatCard label="High priority" value={highCount} tone={highCount ? "danger" : "neutral"} />
        <StatCard label="Fulfilled" value={fulfilledCount} tone="purple" />
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search customer, brand, model…" className="sm:max-w-sm" />
      </div>

      <div className="mb-4">
        <FilterChips items={chips} />
      </div>

      {withMatches.length ? (
        <>
          <div className="space-y-2.5">
            {withMatches.map((r) => {
              const meta = REQUIREMENT_STATUS_META[r.status];
              const prio = LEAD_PRIORITIES.find((p) => p.value === r.priority);
              const fuels = safeJsonParse<string[]>(r.fuelTypes, []);
              const transmissions = safeJsonParse<string[]>(r.transmissions, []);
              const bodies = safeJsonParse<string[]>(r.bodyTypes, []);

              const wants = [
                r.make,
                r.model,
                bodies.join("/") || null,
                fuels.join("/") || null,
                transmissions.join("/") || null,
                r.yearMin ? `${r.yearMin}+` : null,
              ].filter(Boolean);

              return (
                <Card key={r.id} padded={false}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Avatar name={r.customer.name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/requirements/${r.id}`}
                              className="text-[15px] font-semibold text-ink-950 hover:text-brand-700"
                            >
                              {r.customer.name}
                            </Link>
                            <Badge tone={meta?.tone ?? "neutral"} size="sm" dot>
                              {meta?.label ?? r.status}
                            </Badge>
                            {r.priority === "high" && (
                              <Badge tone={prio?.tone ?? "danger"} size="sm">High priority</Badge>
                            )}
                          </div>

                          <p className="mt-1 text-[13.5px] font-medium text-ink-800">
                            {r.budgetMin || r.budgetMax
                              ? `${formatPrice(r.budgetMin ?? 0)} – ${formatPrice(r.budgetMax ?? 10000000)}`
                              : "No budget set"}
                            {wants.length > 0 && (
                              <span className="font-normal text-ink-500"> · {wants.join(" · ")}</span>
                            )}
                          </p>

                          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-400">
                            <span>{r.customer.phone}</span>
                            {r.branch && <span>· {r.branch.name}</span>}
                            {r.createdBy && <span>· by {r.createdBy.name}</span>}
                            <span>· {relativeTime(r.createdAt)}</span>
                          </p>

                          {r.notes && (
                            <p className="mt-2 line-clamp-2 rounded-[8px] bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">
                              {r.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {/* Closed briefs are excluded from matching, so a zero
                            there is not the same as "nothing in stock fits". */}
                        {["open", "matched"].includes(r.status) ? (
                          <Link
                            href={`/requirements/${r.id}`}
                            className={
                              r.matchCount > 0
                                ? "inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-[12.5px] font-semibold text-success-700 ring-1 ring-success-100 ring-inset"
                                : "inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-[12.5px] font-medium text-ink-500"
                            }
                          >
                            <Sparkles className="size-3.5" />
                            {r.matchCount > 0
                              ? `${r.matchCount} car${r.matchCount === 1 ? "" : "s"} match`
                              : "No stock matches"}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-ink-100 px-3 py-1.5 text-[12.5px] font-medium text-ink-500">
                            Matching off
                          </span>
                        )}

                        <div className="flex gap-1.5">
                          <a
                            href={telHref(r.customer.phone)}
                            aria-label={`Call ${r.customer.name}`}
                            className="flex size-9 items-center justify-center rounded-[9px] border border-ink-200 text-ink-600 hover:bg-ink-50"
                          >
                            <Phone className="size-4" />
                          </a>
                          <a
                            href={whatsappHref(
                              r.customer.phone,
                              `Hi ${r.customer.name.split(" ")[0]}, following up on the car you were looking for.`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="WhatsApp"
                            className="flex size-9 items-center justify-center rounded-[9px] bg-success-600 text-white hover:bg-success-700"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/requirements"
            params={sp}
          />
        </>
      ) : (
        <EmptyState
          icon={<Target className="size-6" />}
          title={q || status ? "No requirements match" : "No requirements recorded yet"}
          description={
            q || status
              ? "Try a different filter."
              : "When a customer describes what they want and you have nothing suitable, record it here. Every new car you add gets checked against these briefs automatically."
          }
          action={
            can(user, PERMISSIONS.LEADS_MANAGE) ? (
              <LinkButton href="/requirements/new">Record the first requirement</LinkButton>
            ) : null
          }
        />
      )}
    </div>
  );
}
