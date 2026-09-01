import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2, Plus, MapPin, Phone, Mail, Pencil, Car, Users, Handshake,
} from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { checkLimit } from "@/lib/plan";
import { getDealerBranches } from "@/server/dealer";
import { PageHeader, EmptyState, Card, Badge, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import { BranchToggle } from "@/components/crm/BranchToggle";
import { formatPrice, telHref } from "@/lib/utils";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.BRANCHES_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const canManage = can(user, PERMISSIONS.BRANCHES_MANAGE);

  const [branches, limit] = await Promise.all([
    getDealerBranches(user.dealerId),
    checkLimit(user.dealerId, "branches"),
  ]);

  // Per-branch performance, computed alongside the list so the page tells a story.
  const metrics = await Promise.all(
    branches.map(async (b) => {
      const [stockValue, availableCount, openLeads, sales] = await Promise.all([
        db.vehicle.aggregate({
          where: { branchId: b.id, status: { in: ["available", "reserved", "booked"] } },
          _sum: { sellingPrice: true },
        }),
        db.vehicle.count({ where: { branchId: b.id, status: "available" } }),
        db.lead.count({
          where: { branchId: b.id, stage: { notIn: ["won", "lost", "not_interested"] } },
        }),
        db.sale.count({ where: { branchId: b.id } }),
      ]);
      return {
        branchId: b.id,
        stockValue: stockValue._sum.sellingPrice ?? 0,
        availableCount,
        openLeads,
        sales,
      };
    }),
  );
  const metricFor = (id: string) => metrics.find((m) => m.branchId === id);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Branches"
        description={`${branches.length} location${branches.length === 1 ? "" : "s"} · vehicles, leads and sales are tracked per branch`}
        actions={
          canManage ? (
            <LinkButton href="/branches/new" size="sm" {...(!limit.allowed ? { "aria-disabled": true } : {})}>
              <Plus className="size-4" />
              Add branch
            </LinkButton>
          ) : null
        }
      />

      {sp.created && <Alert tone="success" title="Branch created" className="mb-4">You can start assigning stock to it.</Alert>}
      {sp.updated && <Alert tone="success" title="Branch updated" className="mb-4" />}

      {!limit.allowed && canManage && (
        <Alert tone="warning" title="Branch limit reached" className="mb-4">
          {limit.message} You have {limit.used} of {limit.limit}.
        </Alert>
      )}

      {branches.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((b) => {
            const m = metricFor(b.id);
            return (
              <Card key={b.id} padded={false} className={b.isActive ? "" : "opacity-75"}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-[17px] font-semibold text-ink-950">
                          {b.name}
                        </h2>
                        <Badge tone={b.isActive ? "success" : "neutral"} size="sm" dot>
                          {b.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-400">{b.code}</p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <BranchToggle branchId={b.id} isActive={b.isActive} />
                        <Link
                          href={`/branches/${b.id}/edit`}
                          aria-label={`Edit ${b.name}`}
                          className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        >
                          <Pencil className="size-4" />
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5 text-[12.5px] text-ink-500">
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                      {[b.addressLine, b.city, b.state, b.pincode].filter(Boolean).join(", ")}
                    </p>
                    {b.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="size-3.5 shrink-0 text-ink-400" />
                        <a href={telHref(b.phone)} className="hover:text-brand-700">{b.phone}</a>
                      </p>
                    )}
                    {b.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="size-3.5 shrink-0 text-ink-400" />
                        <span className="break-all">{b.email}</span>
                      </p>
                    )}
                  </div>

                  {b.manager && (
                    <div className="mt-4 flex items-center gap-2.5 rounded-[10px] bg-ink-50 p-2.5">
                      <Avatar name={b.manager.name} src={b.manager.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-ink-900">{b.manager.name}</p>
                        <p className="text-[11px] text-ink-400">Branch manager</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-px border-t border-ink-100 bg-ink-100">
                  {[
                    { icon: Car, label: "In stock", value: m?.availableCount ?? 0 },
                    { icon: null, label: "Stock value", value: formatPrice(m?.stockValue ?? 0) },
                    { icon: Users, label: "Open leads", value: m?.openLeads ?? 0 },
                    { icon: Handshake, label: "Sold", value: m?.sales ?? 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-white px-3 py-3 text-center">
                      <p className="font-display text-[15px] leading-none font-semibold text-ink-950 tabular-nums">
                        {s.value}
                      </p>
                      <p className="mt-1 text-[10.5px] text-ink-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 border-t border-ink-100 p-3">
                  <Link
                    href={`/inventory?branch=${b.id}`}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-[8px] border border-ink-200 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
                  >
                    View stock
                  </Link>
                  <Link
                    href={`/leads?branch=${b.id}`}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-[8px] border border-ink-200 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
                  >
                    View leads
                  </Link>
                  {user.dealerSlug && (
                    <Link
                      href={`/d/${user.dealerSlug}/cars?branch=${b.id}`}
                      target="_blank"
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-[8px] border border-ink-200 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
                    >
                      Public page
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No branches yet"
          description="Create your first showroom. Every vehicle, lead and sale is tracked against a branch."
          action={canManage ? <LinkButton href="/branches/new">Create a branch</LinkButton> : null}
        />
      )}
    </div>
  );
}
