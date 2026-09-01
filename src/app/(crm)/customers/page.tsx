import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Download, Phone, MessageCircle } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, StatCard, Badge, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { TableShell, Th, Td, Tr, Pagination } from "@/components/ui/Table";
import { relativeTime, telHref, whatsappHref, buildQuery, addDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.CUSTOMERS_VIEW)) redirect("/dashboard");

  const sp = await searchParams;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = {
    dealerId: user.dealerId,
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
            { city: { contains: q } },
          ],
        }
      : {}),
  };

  const [customers, total, stats] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { leads: true, testDrives: true, sales: true } },
        leads: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, stage: true, createdAt: true },
        },
      },
    }),
    db.customer.count({ where }),
    Promise.all([
      db.customer.count({ where: { dealerId: user.dealerId } }),
      db.customer.count({
        where: { dealerId: user.dealerId, createdAt: { gte: addDays(new Date(), -30) } },
      }),
      db.customer.count({ where: { dealerId: user.dealerId, sales: { some: {} } } }),
    ]),
  ]);

  const [totalCustomers, newThisMonth, buyers] = stats;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Customers"
        description="One record per mobile number — every enquiry, test drive and purchase in one place."
        actions={
          can(user, PERMISSIONS.REPORTS_EXPORT) ? (
            <LinkButton href="/api/export/customers" variant="outline" size="sm">
              <Download className="size-4" />
              Export
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total customers" value={totalCustomers} tone="brand" icon={<Users className="size-4" />} />
        <StatCard label="Added in 30 days" value={newThisMonth} tone="info" />
        <StatCard label="Have purchased" value={buyers} tone="success" />
        <StatCard
          label="Conversion"
          value={`${totalCustomers ? Math.round((buyers / totalCustomers) * 100) : 0}%`}
          tone="purple"
        />
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search name, phone, city…" className="sm:max-w-sm" />
      </div>

      {customers.length ? (
        <>
          <TableShell
            mobile={
              <>
                {customers.map((c) => (
                  <div key={c.id} className="rounded-[12px] border border-ink-200 bg-white p-3.5">
                    <Link href={`/customers/${c.id}`} className="flex items-start gap-3">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink-950">{c.name}</p>
                        <p className="text-[12px] text-ink-500">
                          {c.phone}
                          {c.city && ` · ${c.city}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone="neutral" size="sm">{c._count.leads} enquiries</Badge>
                          {c._count.sales > 0 && (
                            <Badge tone="success" size="sm">{c._count.sales} purchased</Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
                      <a
                        href={telHref(c.phone)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] border border-ink-200 text-[13px] font-medium text-ink-700"
                      >
                        <Phone className="size-4" />
                        Call
                      </a>
                      <a
                        href={whatsappHref(c.whatsapp ?? c.phone, `Hi ${c.name.split(" ")[0]},`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-success-600 text-[13px] font-medium text-white"
                      >
                        <MessageCircle className="size-4" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                ))}
              </>
            }
          >
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>City</Th>
                <Th align="center">Enquiries</Th>
                <Th align="center">Test drives</Th>
                <Th align="center">Purchases</Th>
                <Th>Last enquiry</Th>
                <Th align="right">Contact</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${c.id}`}
                          className="truncate font-medium text-ink-900 hover:text-brand-700"
                        >
                          {c.name}
                        </Link>
                        <p className="text-[11.5px] text-ink-400">{c.phone}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{c.city ?? "—"}</Td>
                  <Td align="center" className="tabular-nums">{c._count.leads}</Td>
                  <Td align="center" className="tabular-nums">{c._count.testDrives}</Td>
                  <Td align="center">
                    {c._count.sales > 0 ? (
                      <Badge tone="success" size="sm">{c._count.sales}</Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px]">
                    {c.leads[0] ? relativeTime(c.leads[0].createdAt) : "—"}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={telHref(c.phone)}
                        aria-label={`Call ${c.name}`}
                        className="flex size-8 items-center justify-center rounded-[8px] text-ink-500 hover:bg-ink-100"
                      >
                        <Phone className="size-4" />
                      </a>
                      <a
                        href={whatsappHref(c.whatsapp ?? c.phone, `Hi ${c.name.split(" ")[0]},`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="WhatsApp"
                        className="flex size-8 items-center justify-center rounded-[8px] text-success-600 hover:bg-success-50"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/customers"
            params={sp}
          />
        </>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title={q ? "No customers match that search" : "No customers yet"}
          description="Customer records are created automatically from every enquiry."
          action={q ? <LinkButton href="/customers" variant="outline">Clear search</LinkButton> : null}
        />
      )}
    </div>
  );
}
