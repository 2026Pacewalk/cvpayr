import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { ClipboardList, Car, IndianRupee, FileSignature } from "lucide-react";
import { getDealerBySlug } from "@/server/dealer";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import { Card } from "@/components/ui/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "Sell" };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";

  return pageMeta({
    title: `Sell Your Car${where}`,
    description: `Get a fair, same-day valuation for your car from ${dealer.name}${where}. Share the details online and we will tell you what it is worth, with the option to adjust it against your next car.`,
    canonical: `/d/${slug}/sell`,
    images: [dealer.coverUrl, dealer.logoUrl],
    siteName: dealer.name,
  });
}


const STEPS = [
  { icon: ClipboardList, title: "Tell us about your car", body: "Model, year, kilometres and registration state. Takes a minute." },
  { icon: Car, title: "Free inspection", body: "Bring it to any showroom, or we will come to you within the city." },
  { icon: IndianRupee, title: "Firm offer, same day", body: "A written quote valid for seven days. No last-minute reductions." },
  { icon: FileSignature, title: "Instant payment", body: "Money transferred the same day. We handle the RC transfer paperwork." },
];

export default async function SellPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();
  if (dealer.websiteSettings && !dealer.websiteSettings.showSellYourCar) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-950 sm:text-[36px]">
          Sell your car to us
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          We buy directly — no brokers, no listing fees, no strangers at your door. Get a written
          offer the same day and payment as soon as you accept it.
        </p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-[14px] border border-ink-200 bg-white p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                  <s.icon className="size-5" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                    Step {i + 1}
                  </p>
                  <h2 className="mt-1 text-[15px] font-semibold text-ink-900">{s.title}</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <Card className="mt-6">
            <h2 className="text-[15px] font-semibold text-ink-900">What affects your valuation</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-[13px]">
              {[
                { k: "Kilometres driven", v: "Lower readings hold value, but genuine history matters more." },
                { k: "Service records", v: "A full record from an authorised centre can add 3-5%." },
                { k: "Number of owners", v: "First-owner cars command a clear premium." },
                { k: "Accident history", v: "Structural repairs reduce value; cosmetic ones rarely do." },
                { k: "Registration state", v: "Local registration is easier to resell and priced higher." },
                { k: "Market demand", v: "Popular variants and colours move faster and fetch more." },
              ].map((r) => (
                <div key={r.k}>
                  <dt className="font-semibold text-ink-800">{r.k}</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-500">{r.v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20 lg:self-start">
          <EnquiryForm
            dealerSlug={dealer.slug}
            branches={dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }))}
            source="website"
            mode="sell"
            title="Get a free valuation"
            description="Share your car details and we will call you with a number."
          />
        </Card>
      </div>
    </div>
  );
}
