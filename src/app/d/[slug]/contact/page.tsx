import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, MessageCircle, Clock } from "lucide-react";
import { getDealerBySlug, dealerWorkingHours } from "@/server/dealer";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import { Card } from "@/components/ui/primitives";
import { whatsappHref, telHref } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) return { title: "Contact" };

  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";

  return {
    title: `Contact ${dealer.name}${where}`,
    description: `Call, WhatsApp or visit ${dealer.name}${where}. Showroom addresses, phone numbers and opening hours for all ${dealer.branches.length} location${dealer.branches.length === 1 ? "" : "s"}.`,
    alternates: { canonical: `/d/${slug}/contact` },
  };
}


export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  const hours = dealerWorkingHours(dealer);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-950 sm:text-[36px]">
          Talk to us
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          Tell us what you are looking for and our team will shortlist the right cars from all{" "}
          {dealer.branches.length} showrooms. Or just call — we pick up.
        </p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="order-2 lg:order-1">
          <EnquiryForm
            dealerSlug={dealer.slug}
            branches={dealer.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }))}
            source="website"
            title="Send us a message"
            description="We reply during business hours, usually within the hour."
          />
        </Card>

        <div className="order-1 space-y-4 lg:order-2">
          <Card>
            <h2 className="text-[15px] font-semibold text-ink-900">Reach us directly</h2>
            <ul className="mt-4 space-y-4 text-[13.5px]">
              {dealer.phone && (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <div>
                    <p className="field-label">Phone</p>
                    <a href={telHref(dealer.phone)} className="mt-0.5 block font-medium text-ink-900 hover:text-brand-700">
                      {dealer.phone}
                    </a>
                  </div>
                </li>
              )}
              {dealer.email && (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <div className="min-w-0">
                    <p className="field-label">Email</p>
                    <a href={`mailto:${dealer.email}`} className="mt-0.5 block font-medium break-all text-ink-900 hover:text-brand-700">
                      {dealer.email}
                    </a>
                  </div>
                </li>
              )}
              {(dealer.addressLine || dealer.city) && (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <div>
                    <p className="field-label">Head office</p>
                    <p className="mt-0.5 leading-relaxed text-ink-700">
                      {[dealer.addressLine, dealer.city, dealer.state, dealer.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </li>
              )}
              {hours.length > 0 && (
                <li className="flex gap-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <div>
                    <p className="field-label">Hours</p>
                    <p className="mt-0.5 text-ink-700">
                      Mon–Sat {hours[0]?.open}–{hours[0]?.close}
                    </p>
                    <p className="text-ink-700">
                      Sun {hours[6]?.closed ? "Closed" : `${hours[6]?.open}–${hours[6]?.close}`}
                    </p>
                  </div>
                </li>
              )}
            </ul>

            {dealer.whatsapp && (
              <a
                href={whatsappHref(dealer.whatsapp, `Hi ${dealer.name}, I have a question.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-success-600 text-[14px] font-medium text-white hover:bg-success-700"
              >
                <MessageCircle className="size-4" />
                Chat on WhatsApp
              </a>
            )}
          </Card>

          <Card>
            <h2 className="text-[15px] font-semibold text-ink-900">Our showrooms</h2>
            <ul className="mt-4 space-y-4">
              {dealer.branches.map((b) => (
                <li key={b.id} className="border-b border-ink-100 pb-4 last:border-0 last:pb-0">
                  <p className="text-[13.5px] font-semibold text-ink-900">{b.name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                    {[b.addressLine, b.city, b.pincode].filter(Boolean).join(", ")}
                  </p>
                  <div className="mt-2 flex gap-3 text-[12.5px]">
                    {b.phone && (
                      <a href={telHref(b.phone)} className="font-medium text-brand-700 hover:underline">
                        Call
                      </a>
                    )}
                    {b.whatsapp && (
                      <a
                        href={whatsappHref(b.whatsapp, `Hi, I would like to visit the ${b.name}.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        WhatsApp
                      </a>
                    )}
                    {b.mapsUrl && (
                      <a
                        href={b.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Directions
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
