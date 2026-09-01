import Link from "next/link";
import { Sparkles, ArrowRight, MapPin } from "lucide-react";
import { HeroSearch } from "./HeroSearch";
import { VehicleImage } from "@/components/VehicleImage";
import type { TemplateDefinition } from "@/lib/templates";
import { cn } from "@/lib/utils";

export type HeroProps = {
  template: TemplateDefinition;
  base: string;
  dealerName: string;
  headline: string;
  subheadline: string;
  heroImage: string | null;
  stats: { available: number; sold: number; branches: number; since: number | string };
  search: {
    makes: { value: string; count: number }[];
    fuels: { value: string; count: number }[];
    branches: { id: string; name: string; city: string }[];
    priceMax: number;
  };
};

/**
 * The showroom hero, in five compositions.
 *
 * This is where the templates differ most, so each variant is written out in
 * full rather than assembled from shared fragments — a hero built by toggling
 * twenty booleans reads as one design wearing five hats, which is exactly what
 * a dealer choosing a template is trying to avoid.
 */
export function ShowroomHero(props: HeroProps) {
  switch (props.template.hero) {
    case "split":
      return <SplitHero {...props} />;
    case "stage":
      return <StageHero {...props} />;
    case "centred":
      return <CentredHero {...props} />;
    case "stacked":
      return <StackedHero {...props} />;
    default:
      return <OverlayHero {...props} />;
  }
}

function statList(stats: HeroProps["stats"]) {
  return [
    { k: "Cars in stock", v: stats.available },
    { k: "Cars delivered", v: `${stats.sold}+` },
    { k: "Showrooms", v: stats.branches },
    { k: "Serving since", v: stats.since },
  ];
}

/* ------------------------------------------------------------------ */
/* MOMENTUM — photograph with the search floating over it              */
/* ------------------------------------------------------------------ */

function OverlayHero({ base, headline, subheadline, heroImage, stats, search }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-ink-950">
      {heroImage && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/80 via-ink-950/75 to-ink-950/95" />

      <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24 sm:pb-20">
        <p className="tpl-chip inline-flex items-center gap-2 border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-medium text-white/70">
          <Sparkles className="size-3.5" />
          {stats.available} cars in stock across {stats.branches} showroom
          {stats.branches === 1 ? "" : "s"}
        </p>

        <h1 className="mt-6 max-w-3xl text-[32px] leading-[1.12] text-white sm:text-[48px]">
          {headline}
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-white/65 sm:text-[17px]">{subheadline}</p>

        <div className="mt-8 max-w-4xl">
          <HeroSearch base={base} {...search} />
        </div>

        <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-6 border-t border-white/10 pt-8 sm:grid-cols-4">
          {statList(stats).map((s) => (
            <div key={s.k}>
              <dd className="tpl-display text-[22px] leading-none text-white tabular-nums">{s.v}</dd>
              <dt className="mt-1.5 text-[11.5px] font-medium tracking-[0.04em] text-white/40 uppercase">
                {s.k}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* METRO — editorial split, type on the left, one photograph right     */
/* ------------------------------------------------------------------ */

function SplitHero({ base, headline, subheadline, heroImage, stats, search, dealerName }: HeroProps) {
  return (
    <section className="border-b border-ink-200 bg-[#faf9f7]">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-0 sm:px-6 sm:pt-20">
        <div className="grid items-end gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="pb-2">
            {/* A rule rather than a pill — the whole template avoids capsules. */}
            <p className="flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
              <span className="tpl-accent-bg h-px w-8" />
              {dealerName}
            </p>

            <h1 className="mt-6 max-w-xl text-[36px] leading-[1.08] text-ink-950 sm:text-[54px]">
              {headline}
            </h1>
            <p className="mt-5 max-w-md text-[15.5px] leading-[1.7] text-ink-600">{subheadline}</p>

            <Link
              href={`${base}/cars`}
              className="tpl-accent-text mt-7 inline-flex items-center gap-2 border-b border-current pb-1 text-[14px] font-medium"
            >
              Browse all {stats.available} cars
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="relative">
            <div className="tpl-image aspect-[4/3] overflow-hidden border border-ink-200 bg-ink-100">
              <VehicleImage src={heroImage} alt={dealerName} className="size-full" />
            </div>
          </div>
        </div>

        {/* The search sits on the seam between hero and page, in a plain strip. */}
        <div className="mt-12 border-t border-ink-200 py-8">
          <HeroSearch base={base} {...search} />
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-ink-200 bg-ink-200 sm:grid-cols-4">
          {statList(stats).map((s) => (
            <div key={s.k} className="bg-[#faf9f7] py-6">
              <dd className="tpl-display text-[26px] leading-none text-ink-950 tabular-nums">
                {s.v}
              </dd>
              <dt className="mt-2 text-[11px] font-medium tracking-[0.1em] text-ink-400 uppercase">
                {s.k}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* VELOCITY — dark stage, oversized uppercase type                     */
/* ------------------------------------------------------------------ */

function StageHero({ base, headline, subheadline, heroImage, stats, search }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-[#08090c]">
      {heroImage && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 grayscale"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#08090c] via-[#08090c]/85 to-transparent" />
      {/* One hot spot in the dealer's accent, so the darkness has a source. */}
      <div
        className="tpl-accent-bg pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full opacity-25 blur-[130px]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24">
        <p className="tpl-accent-text flex items-center gap-3 text-[11px] font-bold tracking-[0.24em] uppercase">
          <span className="tpl-accent-bg h-px w-10" />
          {stats.available} in stock now
        </p>

        <h1 className="mt-7 max-w-4xl text-[40px] leading-[0.98] text-white uppercase sm:text-[68px]">
          {headline}
        </h1>
        <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-white/55">{subheadline}</p>

        <div className="mt-10 max-w-4xl rounded-[10px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
          <HeroSearch base={base} {...search} />
        </div>

        <dl className="mt-14 flex flex-wrap gap-x-14 gap-y-8">
          {statList(stats).map((s) => (
            <div key={s.k}>
              <dd className="tpl-display text-[34px] leading-none text-white tabular-nums">{s.v}</dd>
              <dt className="tpl-accent-bg mt-3 h-0.5 w-7" />
              <dt className="mt-3 text-[10.5px] font-bold tracking-[0.16em] text-white/40 uppercase">
                {s.k}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ATELIER — centred, spacious, hairlines instead of borders           */
/* ------------------------------------------------------------------ */

function CentredHero({ base, headline, subheadline, heroImage, stats, search, dealerName }: HeroProps) {
  return (
    <section className="bg-[#f7f4ef]">
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-0 text-center sm:px-6 sm:pt-28">
        <p className="text-[11px] font-medium tracking-[0.28em] text-ink-400 uppercase">
          {dealerName}
        </p>

        <h1 className="mx-auto mt-8 max-w-3xl text-[38px] leading-[1.1] text-ink-950 sm:text-[58px]">
          {headline}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-[1.8] font-light text-ink-500">
          {subheadline}
        </p>

        <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-6 text-[12px] tracking-[0.1em] text-ink-400 uppercase">
          <Link href={`${base}/cars`} className="border-b border-ink-300 pb-1 hover:text-ink-800">
            The collection
          </Link>
          <span className="h-3 w-px bg-ink-300" />
          <Link href={`${base}/contact`} className="border-b border-ink-300 pb-1 hover:text-ink-800">
            Enquire
          </Link>
        </div>

        {heroImage && (
          <div className="tpl-image mt-14 aspect-[21/9] overflow-hidden bg-ink-100">
            <VehicleImage src={heroImage} alt={dealerName} className="size-full" />
          </div>
        )}

        <div className="mt-14 border-t border-ink-200 pt-10">
          <HeroSearch base={base} {...search} />
        </div>

        <dl className="mt-14 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 border-t border-ink-200 pt-10 pb-4">
          {statList(stats).map((s, i) => (
            <div key={s.k} className={cn("px-2", i > 0 && "border-l border-ink-200 pl-12")}>
              <dd className="tpl-display text-[30px] leading-none text-ink-900 tabular-nums">
                {s.v}
              </dd>
              <dt className="mt-2.5 text-[10.5px] font-medium tracking-[0.18em] text-ink-400 uppercase">
                {s.k}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* KINETIC — colour block, with the search on a card lifted over it    */
/* ------------------------------------------------------------------ */

function StackedHero({ base, headline, subheadline, heroImage, stats, search }: HeroProps) {
  return (
    <section className="bg-[#fff8f1] pb-4">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="tpl-card tpl-accent-bg relative overflow-hidden px-6 pt-12 pb-28 sm:px-12 sm:pt-16 sm:pb-32">
          {heroImage && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity"
              aria-hidden
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          )}
          {/* Soft blobs, matching the rounded language of the whole template. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-white/20 blur-3xl"
          />

          <div className="relative">
            <p className="tpl-chip inline-flex items-center gap-2 bg-white/25 px-3.5 py-1.5 text-[12.5px] font-semibold text-white">
              <MapPin className="size-3.5" />
              {stats.branches} showroom{stats.branches === 1 ? "" : "s"} near you
            </p>

            <h1 className="mt-6 max-w-2xl text-[34px] leading-[1.08] text-white sm:text-[50px]">
              {headline}
            </h1>
            <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-white/85">
              {subheadline}
            </p>
          </div>
        </div>

        {/* Lifted over the block, which is what makes the layout feel stacked. */}
        <div className="tpl-card relative z-10 -mt-20 border border-ink-200/70 bg-white p-4 shadow-[0_18px_50px_-24px_rgba(16,24,40,0.28)] sm:p-6">
          <HeroSearch base={base} {...search} />
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statList(stats).map((s) => (
            <div key={s.k} className="tpl-card border border-ink-200/70 bg-white px-5 py-4">
              <dd className="tpl-display text-[24px] leading-none text-ink-950 tabular-nums">
                {s.v}
              </dd>
              <dt className="mt-1.5 text-[12px] font-medium text-ink-400">{s.k}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
