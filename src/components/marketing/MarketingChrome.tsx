"use client";

import * as React from "react";
import Link from "next/link";
import { Gauge, ChevronDown, ArrowRight } from "lucide-react";
import {
  MobileMenuOverlay, MobileMenuLink, MobileMenuTrigger,
} from "@/components/ui/MobileMenu";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
];

/** The mobile menu carries the demo alongside the anchors. */
const MENU_LINKS: { href: string; label: string; external?: boolean }[] = [
  ...LINKS,
  { href: "/d/sharma-auto", label: "Live showroom", external: true },
];

/** Marketing header. Goes solid once the hero scrolls past, so the logo stays legible. */
export function MarketingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-colors duration-200",
          scrolled ? "border-b border-ink-200 bg-white/90 backdrop-blur-md" : "bg-transparent",
        )}
      >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-[10px] transition-colors",
              scrolled ? "bg-ink-900 text-white" : "bg-white/10 text-white ring-1 ring-white/15",
            )}
          >
            <Gauge className="size-[18px]" />
          </span>
          <span
            className={cn(
              "font-display text-[16.5px] font-semibold tracking-tight transition-colors",
              scrolled ? "text-ink-950" : "text-white",
            )}
          >
            CarVyapar<span className={scrolled ? "text-brand-600" : "text-brand-300"}>.in</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-[8px] px-3 py-2 text-[13.5px] font-medium transition-colors",
                scrolled
                  ? "text-ink-600 hover:bg-ink-100 hover:text-ink-950"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/d/sharma-auto"
            className={cn(
              "hidden h-9 items-center rounded-[9px] px-3.5 text-[13.5px] font-medium transition-colors sm:inline-flex",
              scrolled
                ? "text-ink-600 hover:bg-ink-100 hover:text-ink-950"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            Live demo
          </Link>
          <Link
            href="/login"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-[9px] px-4 text-[13.5px] font-medium transition-colors",
              scrolled ? "bg-ink-900 text-white hover:bg-ink-800" : "bg-white text-ink-950 hover:bg-white/90",
            )}
          >
            Sign in
            <ArrowRight className="size-3.5" />
          </Link>
          <MobileMenuTrigger
            open={open}
            onToggle={() => setOpen((o) => !o)}
            tone={scrolled ? "dark" : "light"}
            className="md:hidden"
          />
        </div>
      </div>
      </header>

      <MobileMenuOverlay
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Menu"
        brand={
          <>
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/10 text-white ring-1 ring-white/15">
              <Gauge className="size-[18px]" />
            </span>
            <span className="font-display text-[16px] font-semibold tracking-tight text-white">
              CarVyapar<span className="text-brand-300">.in</span>
            </span>
          </>
        }
        footer={
          <div className="space-y-2.5">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-white text-[15px] font-semibold text-ink-950 transition-colors active:bg-white/85"
            >
              Start your free trial
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] border border-white/15 bg-white/5 text-[15px] font-medium text-white transition-colors active:bg-white/10"
            >
              Dealer sign in
            </Link>
            <p className="pt-1 text-center text-[11.5px] text-white/30">
              14-day trial · no card required
            </p>
          </div>
        }
      >
        <div className="pt-1">
          {MENU_LINKS.map((l, i) => (
            <MobileMenuLink
              key={l.href}
              href={l.href}
              label={l.label}
              index={i + 1}
              external={l.external}
              delay={70 + i * 55}
              onClick={() => setOpen(false)}
            />
          ))}
        </div>

        <div
          className="animate-menu-item mt-7 rounded-[14px] border border-white/10 bg-white/[0.03] p-4"
          style={{ animationDelay: `${70 + MENU_LINKS.length * 55}ms` }}
        >
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-white/30 uppercase">
            Already a dealer?
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">
            Open the platform console, or browse a live showroom to see what your customers would
            see.
          </p>
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-300 active:text-brand-200"
          >
            Platform console
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </MobileMenuOverlay>
    </>
  );
}

const FAQS = [
  {
    q: "Do I need a website already?",
    a: "No. Your showroom is created with your account — a full public site at /d/your-name with every car you add, your branding, your branches and your contact details. Point a domain at it whenever you are ready.",
  },
  {
    q: "Can my salespeople see what a car cost me?",
    a: "Only if you let them. Purchase cost, refurbishment spend, minimum acceptable price and profit are behind two separate permissions. Sales executives see the asking price; the cost fields are stripped on the server, so they are not in the page, an export, or a network response.",
  },
  {
    q: "How do enquiries reach my team?",
    a: "Every website form, WhatsApp tap and manually-added walk-in becomes a lead with the vehicle, branch, source and campaign attached. It appears in the pipeline immediately and can be auto-assigned round-robin to the least loaded executive at that branch.",
  },
  {
    q: "What happens when a car is sold?",
    a: "The vehicle moves to Sold, disappears from your public site, and is kept permanently in sales history with a snapshot of cost and margin. Every other open enquiry on that car is closed automatically with the reason 'Vehicle sold'.",
  },
  {
    q: "Can I run more than one showroom?",
    a: "Yes — that is the point. Stock, leads, staff, sales and reports are all tracked per branch, you can transfer a vehicle between branches, and staff can be scoped so a branch manager only sees their own location.",
  },
  {
    q: "What does yearly billing save me?",
    a: "A flat 10% off every plan, applied automatically when you choose yearly. You can switch between monthly and yearly at any time and the price updates on your next cycle.",
  },
];

/** Accessible accordion — one open at a time, keyboard operable via native buttons. */
export function MarketingFAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <div className="divide-y divide-ink-200 overflow-hidden rounded-[16px] border border-ink-200 bg-white">
      {FAQS.map((f, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={f.q}>
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-ink-50/60 sm:px-6 sm:py-5"
            >
              <span className="text-[15px] font-semibold text-ink-900">{f.q}</span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-ink-400 transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            {isOpen && (
              <p className="px-5 pb-5 text-[14px] leading-relaxed text-ink-600 sm:px-6">{f.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
