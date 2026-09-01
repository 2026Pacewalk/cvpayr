import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Plus, Pencil, Mail, Phone, ShieldCheck } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { checkLimit } from "@/lib/plan";
import { getDealerStaff } from "@/server/dealer";
import { PageHeader, EmptyState, Card, Badge, Avatar, StatCard } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Toast";
import { StaffToggle } from "@/components/crm/StaffToggle";
import { formatDate, relativeTime, telHref, safeJsonParse } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.STAFF_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const canManage = can(user, PERMISSIONS.STAFF_MANAGE);

  const [staff, limit] = await Promise.all([
    getDealerStaff(user.dealerId),
    checkLimit(user.dealerId, "users"),
  ]);

  const active = staff.filter((s) => s.isActive);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Staff"
        description="Everyone with access to your dealership account"
        actions={
          canManage ? (
            <>
              <LinkButton href="/roles" variant="outline" size="sm">
                <ShieldCheck className="size-4" />
                Roles & access
              </LinkButton>
              <LinkButton href="/staff/new" size="sm">
                <Plus className="size-4" />
                Add staff
              </LinkButton>
            </>
          ) : null
        }
      />

      {sp.created && <Alert tone="success" title="Staff member added" className="mb-4">They can sign in with the password you set.</Alert>}
      {sp.updated && <Alert tone="success" title="Staff member updated" className="mb-4" />}

      {!limit.allowed && canManage && (
        <Alert tone="warning" title="Staff limit reached" className="mb-4">
          {limit.message} You have {limit.used} of {limit.limit} accounts.
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total accounts" value={staff.length} tone="brand" icon={<Users className="size-4" />} />
        <StatCard label="Active" value={active.length} tone="success" />
        <StatCard label="Deactivated" value={staff.length - active.length} tone="neutral" />
        <StatCard
          label="Plan usage"
          value={limit.unlimited ? "Unlimited" : `${limit.used} / ${limit.limit}`}
          tone={limit.allowed ? "info" : "warning"}
        />
      </div>

      {staff.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {staff.map((s) => {
            const permissionCount = safeJsonParse<string[]>(
              // Roles carry their permission list as JSON; count it for a quick signal.
              (s.role as unknown as { permissions?: string })?.permissions ?? "[]",
              [],
            ).length;

            return (
              <Card key={s.id} className={s.isActive ? "" : "opacity-70"}>
                <div className="flex items-start gap-3.5">
                  <Avatar name={s.name} src={s.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold text-ink-950">{s.name}</h2>
                      {!s.isActive && <Badge tone="neutral" size="sm">Deactivated</Badge>}
                      {s.id === user.id && <Badge tone="brand" size="sm">You</Badge>}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-500">
                      {s.designation ?? s.role?.name ?? "Staff"}
                    </p>

                    <div className="mt-2.5 space-y-1 text-[12.5px] text-ink-500">
                      <p className="flex items-center gap-2">
                        <Mail className="size-3.5 shrink-0 text-ink-400" />
                        <span className="truncate">{s.email}</span>
                      </p>
                      {s.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="size-3.5 shrink-0 text-ink-400" />
                          <a href={telHref(s.phone)} className="hover:text-brand-700">{s.phone}</a>
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {s.role && (
                        <Badge tone="purple" size="sm">
                          {s.role.name}
                          {permissionCount > 0 && ` · ${permissionCount} permissions`}
                        </Badge>
                      )}
                      {s.branches.length ? (
                        s.branches.map((b) => (
                          <Badge key={b.branch.id} tone="neutral" size="sm">
                            {b.branch.city}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="info" size="sm">All branches</Badge>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">
                      <span>{s._count.assignedLeads} leads</span>
                      <span>{s._count.sales} sales</span>
                      <span>
                        {s.lastLoginAt ? `Last seen ${relativeTime(s.lastLoginAt)}` : "Never signed in"}
                      </span>
                      <span>Added {formatDate(s.createdAt)}</span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Link
                        href={`/staff/${s.id}/edit`}
                        aria-label={`Edit ${s.name}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      {s.id !== user.id && <StaffToggle staffId={s.id} isActive={s.isActive} />}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No staff yet"
          description="Add your sales team so leads can be assigned and performance tracked."
          action={canManage ? <LinkButton href="/staff/new">Add your first staff member</LinkButton> : null}
        />
      )}
    </div>
  );
}
