import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getDealerBySlug } from "@/server/dealer";
import { ShortlistClient } from "./ShortlistClient";

// Built entirely from choices saved in this visitor's own browser, so there is
// nothing here to index — only a URL that would compete with the listing pages
// that do have content.
export const metadata: Metadata = { title: "Your shortlist", robots: NOINDEX };

export default async function ShortlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="font-display text-[26px] leading-tight font-semibold text-ink-950 sm:text-[32px]">
          Your shortlist
        </h1>
        <p className="mt-2 text-[14px] text-ink-500">
          Saved on this device. Nothing is shared until you send us an enquiry.
        </p>
      </header>

      <ShortlistClient dealerSlug={dealer.slug} base={`/d/${dealer.slug}`} />
    </div>
  );
}
