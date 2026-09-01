import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Zap, Undo2 } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getAttention, attentionScope } from "@/server/attention";
import { getDealerBranches } from "@/server/dealer";
import { db } from "@/lib/db";
import { AttentionCard } from "@/components/crm/AttentionCard";
import { RestoreHiddenActions } from "@/components/crm/RestoreHiddenActions";
import { PageHeader, Card } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { FilterChips } from "@/components/ui/Tabs";
import {
  ACTION_META,
  ACTION_CATEGORY_META,
  ACTION_PRIORITY_META,
  ACTION_PRIORITIES,
  type ActionCategory,
} from "@/lib/attention";
import { buildQuery, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Needs your attention" };
export const dynamic = "force-dynamic";

/**
 * The full action centre.
 *
 * Everything unresolved, grouped by how urgent it is. The branch filter can only
 * ever narrow what the session already permits — the scope helper drops a branch
 * the user does not hold, so a hand-typed `?branch=` gains nothing.
 */
export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  const sp = await searchParams;

  const branchParam = sp.branch ?? null;
  const scope = attentionScope(user, branchParam);
  const [result, branches, hiddenCount] = await Promise.all([
    getAttention(scope),
    getDealerBranches(user.dealerId, true),
    db.actionDismissal.count({ where: { userId: user.id } }),
  ]);

  const visibleBranches = user.branchIds.length
    ? branches.filter((b) => user.branchIds.includes(b.id))
    : branches;

  const categoryParam = sp.category as ActionCategory | undefined;
  const filtered = categoryParam
    ? result.items.filter((i) => ACTION_META[i.key].category === categoryParam)
    : result.items;

  const usedCategories = [...new Set(result.items.map((i) => ACTION_META[i.key].category))];

  const categoryChips = [
    {
      href: `/attention${buildQuery(sp, { category: undefined })}`,
      label: "Everything",
      count: result.items.length,
      active: !categoryParam,
    },
    ...usedCategories.map((c) => ({
      href: `/attention${buildQuery(sp, { category: c })}`,
      label: ACTION_CATEGORY_META[c].label,
      count: result.items.filter((i) => ACTION_META[i.key].category === c).length,
      active: categoryParam === c,
    })),
  ];

  const byPriority = ACTION_PRIORITIES.map((p) => ({
    priority: p,
    items: filtered.filter((i) => i.priority === p),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Needs your attention"
        description={
          result.items.length
            ? `${result.workCount} thing${result.workCount === 1 ? "" : "s"} across ${result.items.length} area${result.items.length === 1 ? "" : "s"} of the business`
            : "Everything is up to date"
        }
        actions={
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && <RestoreHiddenActions count={hiddenCount} />}
            <LinkButton href="/attention/day" size="sm">
              <Zap className="size-4" />
              Start my day
            </LinkButton>
          </div>
        }
      />

      {visibleBranches.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link
            href={`/attention${buildQuery(sp, { branch: undefined })}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              branchParam
                ? "border border-ink-200 text-ink-600 hover:bg-ink-50"
                : "bg-ink-900 text-white",
            )}
          >
            All branches
          </Link>
          {visibleBranches.map((b) => (
            <Link
              key={b.id}
              href={`/attention${buildQuery(sp, { branch: b.id })}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                branchParam === b.id
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 text-ink-600 hover:bg-ink-50",
              )}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      {result.items.length > 0 && (
        <div className="mb-5">
          <FilterChips items={categoryChips} />
        </div>
      )}

      {byPriority.length ? (
        <div className="space-y-6">
          {byPriority.map((group) => (
            <section key={group.priority}>
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  className={cn("size-2 rounded-full", ACTION_PRIORITY_META[group.priority].dot)}
                />
                <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {ACTION_PRIORITY_META[group.priority].label}
                </h2>
                <span className="text-[11.5px] text-ink-400">
                  {ACTION_PRIORITY_META[group.priority].blurb}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => (
                  <AttentionCard
                    key={item.id}
                    item={item}
                    canAssign={can(user, PERMISSIONS.LEADS_ASSIGN)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="px-6 py-14 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success-50 text-success-600">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="font-display text-[17px] font-semibold text-ink-950">
            {categoryParam ? "Nothing here" : "All caught up"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-600">
            {categoryParam
              ? "Nothing in this part of the business needs you right now."
              : "No urgent actions require your attention. Every enquiry has been answered, every follow-up is on schedule, and nothing is about to lapse."}
          </p>
          {hiddenCount > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-ink-400">
              <Undo2 className="size-3.5" />
              {hiddenCount} item{hiddenCount === 1 ? " is" : "s are"} hidden or snoozed
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
