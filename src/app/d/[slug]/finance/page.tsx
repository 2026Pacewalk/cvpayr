import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wallet, Clock3, FileCheck2, Percent, CheckCircle2 } from "lucide-react";
import { getDealerBySlug } from "@/server/dealer";
import { db } from "@/lib/db";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import { EMICalculator } from "@/components/public/VehicleActions";
import { Card } from "@/components/ui/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "Finance" };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";

  return {
    title: `Used Car Loan & Finance${where}`,
    description: `Arrange finance on a pre-owned car from ${dealer.name}${where}. Tell us what you are looking at and we will come back with the loan options you are likely to be approved for.`,
    alternates: { canonical: `/d/${slug}/finance` },
  };
}


const STEPS = [
  { icon: FileCheck2, title: "Share your documents", body: "PAN, Aadhaar, three months of bank statements and salary slips or ITR." },
  { icon: Percent, title: "We compare lenders", body: "We run your profile past our partner banks and NBFCs to find the best rate." },
  { icon: Clock3, title: "Approval in 48 hours", body: "Most files are sanctioned within two working days of complete documents." },
  { icon: Wallet, title: "Drive home", body: "We handle the disbursal, hypothecation and RC endorsement for you." },
];

export default async function FinancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();
  if (dealer.websiteSettings && !dealer.websiteSettings.showFinance) notFound();

  const median = await db.vehicle.aggregate({
    where: { dealerId: dealer.id, status: "available" },
    _avg: { sellingPrice: true },
  });
  const samplePrice = Math.round((median._avg.sellingPrice ?? 800000) / 10000) * 10000;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-950 sm:text-[36px]">
          Finance your car
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          We work with nine banks and NBFCs. Tell us your budget and we will come back with the
          lowest rate you qualify for — no obligation, no charge for the comparison.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Card key={s.title}>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                <s.icon className="size-[18px]" />
              </span>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                Step {i + 1}
              </span>
            </div>
            <h2 className="mt-3.5 text-[14.5px] font-semibold text-ink-900">{s.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{s.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <EMICalculator price={samplePrice} />

          <Card>
            <h2 className="text-[15px] font-semibold text-ink-900">What you will need</h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {[
                "PAN card",
                "Aadhaar card",
                "Last 3 months bank statement",
                "Salary slips or 2 years ITR",
                "Passport-size photographs",
                "Address proof",
              ].map((doc) => (
                <li key={doc} className="flex items-center gap-2 text-[13px] text-ink-700">
                  <CheckCircle2 className="size-4 shrink-0 text-success-600" />
                  {doc}
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-[10px] bg-ink-50 p-3.5 text-[12.5px] leading-relaxed text-ink-500">
              Interest rates depend on your credit profile, the age of the vehicle and the loan
              tenure. The calculator above is indicative — your final offer comes from the lender.
            </p>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20 lg:self-start">
          <EnquiryForm
            dealerSlug={dealer.slug}
            branches={dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }))}
            source="website"
            mode="callback"
            title="Check your eligibility"
            description="Share your details and we will call you with indicative offers."
          />
        </Card>
      </div>
    </div>
  );
}
