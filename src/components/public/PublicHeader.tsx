"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessageCircle, Heart, GitCompare, Car } from "lucide-react";
import {
  MobileMenuOverlay, MobileMenuLink, MobileMenuItem, MobileMenuTrigger,
} from "@/components/ui/MobileMenu";
import { cn, whatsappHref, telHref } from "@/lib/utils";
import { useFavourites, useCompare } from "@/lib/browser-store";

export type PublicNavLink = { href: string; label: string };

export function PublicHeader({
  dealer,
  links,
  base,
}: {
  dealer: { name: string; logoUrl: string | null; phone: string | null; whatsapp: string | null; tagline: string | null };
  links: PublicNavLink[];
  base: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const favourites = useFavourites();
  const compare = useCompare();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href={base} className="flex min-w-0 items-center gap-2.5">
            {dealer.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dealer.logoUrl} alt={dealer.name} className="size-9 rounded-[9px] object-cover" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-ink-900 text-white">
                <Car className="size-[18px]" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] leading-tight font-semibold text-ink-950">
                {dealer.name}
              </span>
              {dealer.tagline && (
                <span className="hidden truncate text-[11px] text-ink-500 sm:block">
                  {dealer.tagline}
                </span>
              )}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-[8px] px-3 py-2 text-[13.5px] font-medium transition-colors",
                  isActive(l.href)
                    ? "bg-ink-100 text-ink-950"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {mounted && compare.count > 0 && (
              <Link
                href={`${base}/compare`}
                className="relative hidden size-9 items-center justify-center rounded-[9px] text-ink-600 hover:bg-ink-100 sm:flex"
                aria-label={`Compare (${compare.count})`}
              >
                <GitCompare className="size-[18px]" />
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">
                  {compare.count}
                </span>
              </Link>
            )}
            <Link
              href={`${base}/shortlist`}
              className="relative flex size-9 items-center justify-center rounded-[9px] text-ink-600 hover:bg-ink-100"
              aria-label={`Shortlist${mounted && favourites.count ? ` (${favourites.count})` : ""}`}
            >
              <Heart className="size-[18px]" />
              {mounted && favourites.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-danger-600 text-[10px] font-semibold text-white">
                  {favourites.count}
                </span>
              )}
            </Link>

            {dealer.whatsapp && (
              <a
                href={whatsappHref(dealer.whatsapp, `Hi ${dealer.name}, I would like to know more about your cars.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-9 items-center gap-2 rounded-[9px] bg-success-600 px-3.5 text-[13px] font-medium text-white hover:bg-success-700 sm:inline-flex"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            )}
            {dealer.phone && (
              <a
                href={telHref(dealer.phone)}
                className="hidden h-9 items-center gap-2 rounded-[9px] bg-ink-900 px-3.5 text-[13px] font-medium text-white hover:bg-ink-800 md:inline-flex"
              >
                <Phone className="size-4" />
                Call
              </a>
            )}

            <MobileMenuTrigger
              open={open}
              onToggle={() => setOpen((o) => !o)}
              tone="dark"
              className="lg:hidden"
            />
          </div>
        </div>

      </header>

      <MobileMenuOverlay
        open={open}
        onClose={() => setOpen(false)}
        breakpoint="lg"
        eyebrow="Browse"
        brand={
          <>
            {dealer.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dealer.logoUrl}
                alt={dealer.name}
                className="size-9 rounded-[10px] object-cover ring-1 ring-white/15"
              />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/10 text-white ring-1 ring-white/15">
                <Car className="size-[18px]" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] leading-tight font-semibold text-white">
                {dealer.name}
              </span>
              {dealer.tagline && (
                <span className="block truncate text-[11px] text-white/40">{dealer.tagline}</span>
              )}
            </span>
          </>
        }
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            {dealer.phone && (
              <a
                href={telHref(dealer.phone)}
                className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-white text-[15px] font-semibold text-ink-950 transition-colors active:bg-white/85"
              >
                <Phone className="size-4" />
                Call us
              </a>
            )}
            {dealer.whatsapp && (
              <a
                href={whatsappHref(
                  dealer.whatsapp,
                  `Hi ${dealer.name}, I would like to know more about your cars.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-success-600 text-[15px] font-semibold text-white transition-colors active:bg-success-700"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            )}
          </div>
        }
      >
        <div className="pt-1">
          {links.map((l, i) => (
            <MobileMenuLink
              key={l.href}
              href={l.href}
              label={l.label}
              index={i + 1}
              active={isActive(l.href)}
              delay={70 + i * 45}
              onClick={() => setOpen(false)}
            />
          ))}
        </div>

        {/* A car buyer's own lists, with live counts — the reason they came back */}
        <div
          className="animate-menu-item mt-7 space-y-2"
          style={{ animationDelay: `${70 + links.length * 45}ms` }}
        >
          <p className="px-1 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-white/25 uppercase">
            Your cars
          </p>
          <MobileMenuItem
            href={`${base}/shortlist`}
            label="Shortlist"
            description={
              mounted && favourites.count
                ? `${favourites.count} car${favourites.count === 1 ? "" : "s"} saved`
                : "Nothing saved yet"
            }
            icon={<Heart className={cn("size-[18px]", mounted && favourites.count > 0 && "fill-current")} />}
            active={isActive(`${base}/shortlist`)}
            onClick={() => setOpen(false)}
          />
          <MobileMenuItem
            href={`${base}/compare`}
            label="Compare"
            description={
              mounted && compare.count
                ? `${compare.count} of 4 selected`
                : "Line up to four cars side by side"
            }
            icon={<GitCompare className="size-[18px]" />}
            active={isActive(`${base}/compare`)}
            onClick={() => setOpen(false)}
          />
        </div>
      </MobileMenuOverlay>

      {/* Compare tray */}
      {mounted && compare.count > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 shadow-[0_-4px_16px_rgba(16,24,40,0.06)] backdrop-blur sm:hidden">
          <Link
            href={`${base}/compare`}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-ink-900 text-[14px] font-medium text-white"
          >
            <GitCompare className="size-4" />
            Compare {compare.count} car{compare.count === 1 ? "" : "s"}
          </Link>
        </div>
      )}
    </>
  );
}
