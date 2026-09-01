import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, MessageCircle, Car, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getDealerBySlug } from "@/server/dealer";
import { PUBLIC_VEHICLE_STATUSES } from "@/lib/constants";
import { vehicleCardSelect } from "@/server/inventory";
import { PublicVehicleCard } from "@/components/VehicleCard";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import { Card, EmptyState } from "@/components/ui/primitives";
import { vehicleSlug, whatsappHref, telHref } from "@/lib/utils";

type Props = { params: Promise<{ slug: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const catalog = await db.sharedCatalog.findUnique({ where: { code }, select: { title: true } });
  return { title: catalog?.title ?? "Shared collection", robots: { index: false } };
}

export default async function SharedCatalogPage({ params }: Props) {
  const { slug, code } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const catalog = await db.sharedCatalog.findFirst({
    where: { code, dealerId: dealer.id },
    include: {
      createdBy: { select: { name: true, phone: true, whatsapp: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!catalog) notFound();
  if (catalog.expiresAt && catalog.expiresAt < new Date()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-[24px] font-semibold text-ink-950">
          This collection has expired
        </h1>
        <p className="mt-2 text-[14px] text-ink-500">
          Ask our team to send you a fresh link, or browse the full inventory.
        </p>
        <Link
          href={`/d/${dealer.slug}/cars`}
          className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-ink-900 px-5 text-[14px] font-medium text-white"
        >
          Browse all cars
        </Link>
      </div>
    );
  }

  // Fire-and-forget view counter.
  void db.sharedCatalog
    .update({ where: { id: catalog.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => null);

  const base = `/d/${dealer.slug}`;
  const vehicleIds = catalog.items.map((i) => i.vehicleId);
  const notes = new Map(catalog.items.map((i) => [i.vehicleId, i.note]));

  const vehicles = vehicleIds.length
    ? await db.vehicle.findMany({
        where: {
          dealerId: dealer.id,
          id: { in: vehicleIds },
          status: { in: [...PUBLIC_VEHICLE_STATUSES] },
        },
        select: vehicleCardSelect,
      })
    : [];

  const order = new Map(vehicleIds.map((id, i) => [id, i]));
  vehicles.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const contact = catalog.createdBy;
  const whatsappNumber = contact?.whatsapp ?? contact?.phone ?? dealer.whatsapp;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-[16px] border border-brand-200 bg-brand-50/50 p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-brand-700">
          <Sparkles className="size-3.5" />
          Handpicked for you
        </p>
        <h1 className="mt-4 font-display text-[26px] leading-tight font-semibold text-ink-950 sm:text-[32px]">
          {catalog.customerName ? `${catalog.customerName}, ` : ""}
          {catalog.title}
        </h1>
        {catalog.subtitle && (
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
            {catalog.subtitle}
          </p>
        )}
        {contact && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-brand-200/60 pt-5">
            <p className="text-[13px] text-ink-600">
              Shortlisted by <span className="font-semibold text-ink-900">{contact.name}</span>
            </p>
            <div className="flex gap-2">
              {contact.phone && (
                <a
                  href={telHref(contact.phone)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-ink-900 px-3.5 text-[13px] font-medium text-white hover:bg-ink-800"
                >
                  <Phone className="size-3.5" />
                  Call
                </a>
              )}
              {whatsappNumber && (
                <a
                  href={whatsappHref(
                    whatsappNumber,
                    `Hi ${contact.name}, I looked at the cars you shortlisted for me.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-success-600 px-3.5 text-[13px] font-medium text-white hover:bg-success-700"
                >
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {vehicles.length ? (
        <div className="mt-8 grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id}>
              <PublicVehicleCard vehicle={v} href={`${base}/cars/${vehicleSlug(v)}`} />
              {notes.get(v.id) && (
                <p className="mt-2 rounded-[10px] bg-ink-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-600">
                  <span className="font-medium text-ink-800">Note: </span>
                  {notes.get(v.id)}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-8"
          icon={<Car className="size-6" />}
          title="These cars are no longer available"
          description="They may have been sold since this list was shared. Browse our current stock instead."
          action={
            <Link
              href={`${base}/cars`}
              className="inline-flex h-10 items-center rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white"
            >
              Browse all cars
            </Link>
          }
        />
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <h2 className="text-[15px] font-semibold text-ink-900">Not quite right?</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
            Tell us what would work better — budget, body type, fuel or transmission — and we will
            send a fresh shortlist from all {dealer.branches.length} showrooms.
          </p>
          <Link
            href={`${base}/cars`}
            className="mt-4 inline-flex h-10 items-center rounded-[10px] border border-ink-200 px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Browse the full inventory
          </Link>
        </Card>

        <Card>
          <EnquiryForm
            dealerSlug={dealer.slug}
            source="website"
            mode="callback"
            compact
            title="Ask about these cars"
            description="We will call you back."
          />
        </Card>
      </div>
    </div>
  );
}
