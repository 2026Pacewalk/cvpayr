import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDealerBySlug } from "@/server/dealer";
import { CompareClient } from "./CompareClient";

export const metadata: Metadata = { title: "Compare cars" };

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);
  if (!dealer) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="font-display text-[26px] leading-tight font-semibold text-ink-950 sm:text-[32px]">
          Compare cars
        </h1>
        <p className="mt-2 text-[14px] text-ink-500">
          Up to four cars side by side. The better figure in each row is highlighted.
        </p>
      </header>

      <CompareClient dealerSlug={dealer.slug} base={`/d/${dealer.slug}`} />
    </div>
  );
}
