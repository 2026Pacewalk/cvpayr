import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, FileCheck2, Wallet, Repeat, Building2, Users, Car, Award } from "lucide-react";
import { getDealerBySlug, getDealerStats, dealerWhyChooseUs, dealerWorkingHours } from "@/server/dealer";
import { Card } from "@/components/ui/primitives";
import { VehicleImage } from "@/components/VehicleImage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "About" };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";

  return pageMeta({
    title: "About us",
    description:
      dealer.about?.slice(0, 155) ??
      `Who we are, how we inspect and price our cars, and why buyers${where} keep coming back to ${dealer.name}.`,
    canonical: `/d/${slug}/about`,
    images: [dealer.coverUrl, dealer.logoUrl],
    siteName: dealer.name,
  });
}


const ICONS: Record<string, typeof ShieldCheck> = {
  shield: ShieldCheck,
  file: FileCheck2,
  wallet: Wallet,
  repeat: Repeat,
};

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const base = `/d/${dealer.slug}`;
  const [stats, why, hours] = [
    await getDealerStats(dealer.id),
    dealerWhyChooseUs(dealer),
    dealerWorkingHours(dealer),
  ];

  return (
    <div>
      <section className="relative overflow-hidden bg-ink-950">
        <div className="absolute inset-0">
          <VehicleImage src={dealer.coverUrl} alt="" className="size-full opacity-30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 to-ink-950/95" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
          <h1 className="font-display text-[30px] leading-tight font-semibold text-white sm:text-[42px]">
            About {dealer.name}
          </h1>
          {dealer.tagline && (
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/60">
              {dealer.tagline}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        {dealer.about && (
          <div className="text-[15px] leading-[1.75] whitespace-pre-line text-ink-600">
            {dealer.about}
          </div>
        )}

        <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Car, k: "Cars in stock", v: stats.available },
            { icon: Award, k: "Cars delivered", v: `${stats.sold}+` },
            { icon: Building2, k: "Showrooms", v: stats.branches },
            { icon: Users, k: "Customers served", v: `${stats.happyCustomers}+` },
          ].map((s) => (
            <Card key={s.k} className="text-center">
              <s.icon className="mx-auto size-5 text-brand-600" />
              <dd className="mt-3 font-display text-[22px] leading-none font-semibold text-ink-950 tabular-nums">
                {s.v}
              </dd>
              <dt className="mt-1.5 text-[12px] text-ink-500">{s.k}</dt>
            </Card>
          ))}
        </dl>

        {why.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-[22px] font-semibold text-ink-950">
              How we work
            </h2>
            <div className="mt-6 space-y-3">
              {why.map((item) => {
                const Icon = ICONS[item.icon] ?? ShieldCheck;
                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-[14px] border border-ink-200 bg-white p-5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-ink-900">{item.title}</h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-14 grid gap-6 sm:grid-cols-2">
          <Card>
            <h2 className="text-[15px] font-semibold text-ink-900">Business details</h2>
            <dl className="mt-4 space-y-3 text-[13px]">
              {[
                { k: "Registered name", v: dealer.legalName ?? dealer.name },
                { k: "Contact person", v: dealer.contactPerson },
                { k: "GSTIN", v: dealer.gstin },
                { k: "Head office", v: [dealer.addressLine, dealer.city, dealer.state, dealer.pincode].filter(Boolean).join(", ") },
                { k: "Operating since", v: String(stats.since) },
              ]
                .filter((r) => r.v)
                .map((r) => (
                  <div key={r.k} className="flex justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                    <dt className="shrink-0 text-ink-500">{r.k}</dt>
                    <dd className="text-right font-medium text-ink-900">{r.v}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          {hours.length > 0 && (
            <Card>
              <h2 className="text-[15px] font-semibold text-ink-900">Opening hours</h2>
              <dl className="mt-4 space-y-2 text-[13px]">
                {hours.map((h) => (
                  <div key={h.day} className="flex justify-between border-b border-ink-100 pb-2 last:border-0 last:pb-0">
                    <dt className="text-ink-500">{h.day}</dt>
                    <dd className="font-medium text-ink-900 tabular-nums">
                      {h.closed ? "Closed" : `${h.open} – ${h.close}`}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </section>

        <div className="mt-14 rounded-[16px] bg-ink-950 p-8 text-center">
          <h2 className="font-display text-[22px] font-semibold text-white">
            Come and see the cars for yourself
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-[14px] text-white/60">
            No appointment needed, but calling ahead means the car is ready when you arrive.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`${base}/cars`}
              className="inline-flex h-11 items-center rounded-[10px] bg-white px-5 text-[14px] font-medium text-ink-950 hover:bg-white/90"
            >
              Browse inventory
            </Link>
            <Link
              href={`${base}/contact`}
              className="inline-flex h-11 items-center rounded-[10px] border border-white/20 px-5 text-[14px] font-medium text-white hover:bg-white/10"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
