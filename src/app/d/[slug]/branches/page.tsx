import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Mail, Clock, MessageCircle, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { getDealerBySlug, branchImages } from "@/server/dealer";
import { VehicleImage } from "@/components/VehicleImage";
import { Card } from "@/components/ui/primitives";
import { whatsappHref, telHref } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "Showrooms" };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";
  const all = [...new Set(dealer.branches.map((b) => b.city).filter(Boolean))];
  // Read as a list up to three cities; past that a title is truncated in
  // results anyway, so it names the two biggest and counts the rest.
  const cities =
    all.length <= 1
      ? (all[0] ?? "")
      : all.length <= 3
        ? `${all.slice(0, -1).join(", ")} & ${all[all.length - 1]}`
        : `${all.slice(0, 2).join(", ")} & ${all.length - 2} more`;

  return {
    title: cities ? `Used Car Showrooms in ${cities}` : "Our showrooms",
    description: `Visit ${dealer.name} at ${dealer.branches.length} showroom${dealer.branches.length === 1 ? "" : "s"}${all.length ? ` across ${all.join(", ")}` : ""}. Addresses, directions, phone numbers and opening hours for each location.`,
    alternates: { canonical: `/d/${slug}/branches` },
  };
}


export default async function BranchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const base = `/d/${dealer.slug}`;

  const counts = await db.vehicle.groupBy({
    by: ["branchId"],
    where: { dealerId: dealer.id, status: { in: ["available", "reserved", "booked"] } },
    _count: { _all: true },
  });
  const stockByBranch = new Map(counts.map((c) => [c.branchId, c._count._all]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-950 sm:text-[36px]">
          Our showrooms
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          {dealer.branches.length} location{dealer.branches.length === 1 ? "" : "s"} across North
          India. Call ahead and we will keep the car ready and washed for your visit.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        {dealer.branches.map((branch) => {
          const images = branchImages(branch);
          const stock = stockByBranch.get(branch.id) ?? 0;

          return (
            <Card key={branch.id} padded={false} className="overflow-hidden">
              <div className="grid lg:grid-cols-[320px_1fr]">
                <div className="relative aspect-[16/10] bg-ink-100 lg:aspect-auto lg:min-h-[240px]">
                  <VehicleImage
                    src={images[0] ?? dealer.coverUrl}
                    alt={branch.name}
                    className="size-full"
                  />
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-[19px] font-semibold text-ink-950">
                        {branch.name}
                      </h2>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-400">
                        Branch code {branch.code}
                      </p>
                    </div>
                    <Link
                      href={`${base}/cars?branch=${branch.id}`}
                      className="group inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-100"
                    >
                      {stock} car{stock === 1 ? "" : "s"} in stock
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="flex gap-2.5">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-ink-400" />
                      <div>
                        <dt className="field-label">Address</dt>
                        <dd className="mt-0.5 text-[13px] leading-relaxed text-ink-700">
                          {[branch.addressLine, branch.city, branch.state, branch.pincode]
                            .filter(Boolean)
                            .join(", ")}
                        </dd>
                      </div>
                    </div>

                    {branch.openingHours && (
                      <div className="flex gap-2.5">
                        <Clock className="mt-0.5 size-4 shrink-0 text-ink-400" />
                        <div>
                          <dt className="field-label">Open</dt>
                          <dd className="mt-0.5 text-[13px] text-ink-700">{branch.openingHours}</dd>
                        </div>
                      </div>
                    )}

                    {branch.phone && (
                      <div className="flex gap-2.5">
                        <Phone className="mt-0.5 size-4 shrink-0 text-ink-400" />
                        <div>
                          <dt className="field-label">Phone</dt>
                          <dd className="mt-0.5 text-[13px] text-ink-700">
                            <a href={telHref(branch.phone)} className="hover:text-brand-700">
                              {branch.phone}
                            </a>
                          </dd>
                        </div>
                      </div>
                    )}

                    {branch.email && (
                      <div className="flex gap-2.5">
                        <Mail className="mt-0.5 size-4 shrink-0 text-ink-400" />
                        <div>
                          <dt className="field-label">Email</dt>
                          <dd className="mt-0.5 text-[13px] break-all text-ink-700">
                            <a href={`mailto:${branch.email}`} className="hover:text-brand-700">
                              {branch.email}
                            </a>
                          </dd>
                        </div>
                      </div>
                    )}
                  </dl>

                  <div className="mt-6 flex flex-wrap gap-2 border-t border-ink-100 pt-5">
                    <Link
                      href={`${base}/cars?branch=${branch.id}`}
                      className="inline-flex h-10 items-center rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800"
                    >
                      Browse stock
                    </Link>
                    {branch.phone && (
                      <a
                        href={telHref(branch.phone)}
                        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <Phone className="size-4" />
                        Call
                      </a>
                    )}
                    {branch.whatsapp && (
                      <a
                        href={whatsappHref(
                          branch.whatsapp,
                          `Hi, I would like to visit the ${branch.name}. What time works?`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-success-600 px-4 text-[13px] font-medium text-white hover:bg-success-700"
                      >
                        <MessageCircle className="size-4" />
                        WhatsApp
                      </a>
                    )}
                    {branch.mapsUrl && (
                      <a
                        href={branch.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <MapPin className="size-4" />
                        Directions
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
