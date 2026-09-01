"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, CreditCard, BarChart3, Settings, LogOut, Gauge,
  Ticket, ExternalLink, ShieldCheck, Globe, Bell,
} from "lucide-react";
import {
  MobileMenuOverlay, MobileMenuItem, MobileMenuTrigger,
} from "@/components/ui/MobileMenu";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/primitives";
import { logoutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, hint: "Revenue, accounts and trials" },
  { href: "/admin/dealers", label: "Dealers", icon: Building2, hint: "Every tenant on the platform" },
  { href: "/admin/plans", label: "Plans", icon: CreditCard, hint: "Limits, pricing and feature flags" },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket, hint: "Subscription discounts" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, hint: "Cross-tenant performance" },
  { href: "/admin/notifications", label: "Alerts", icon: Bell, hint: "Subscriptions and trials" },
  { href: "/admin/settings", label: "Settings", icon: Settings, hint: "Platform configuration" },
];

/**
 * The platform console deliberately looks different from the dealer CRM —
 * a dark command bar makes it unmistakable that you are operating across every
 * tenant rather than inside one dealership.
 */
export function AdminShell({
  user,
  unreadCount = 0,
  children,
}: {
  user: { name: string; email: string; avatarUrl: string | null };
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="relative overflow-hidden bg-ink-950 text-white">
        {/* Brand glow — keeps the console from reading as a flat black bar */}
        <div className="pointer-events-none absolute -top-32 left-1/3 size-[420px] rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex h-16 items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/10 ring-1 ring-white/15">
                <Gauge className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[15px] leading-tight font-semibold tracking-tight">
                  CarVyapar<span className="text-brand-300">.in</span>
                </span>
                <span className="flex items-center gap-1 text-[10px] tracking-[0.1em] text-white/40 uppercase">
                  <ShieldCheck className="size-2.5" />
                  Platform console
                </span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/admin/notifications"
                aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
                className="relative flex size-9 items-center justify-center rounded-[9px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Bell className="size-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>

              <Link
                href="/"
                target="_blank"
                className="hidden h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                <ExternalLink className="size-3.5" />
                Website
              </Link>

              <div className="hidden items-center gap-2.5 rounded-full bg-white/5 py-1 pr-3 pl-1 ring-1 ring-white/10 sm:flex">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                <div className="hidden lg:block">
                  <p className="text-[12.5px] leading-tight font-medium">{user.name}</p>
                  <p className="text-[10.5px] text-white/40">Super Admin</p>
                </div>
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex size-9 items-center justify-center rounded-[9px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="size-4" />
                </button>
              </form>

              <MobileMenuTrigger
                open={open}
                onToggle={() => setOpen((o) => !o)}
                tone="light"
                className="md:hidden"
              />
            </div>
          </div>

          {/* Pill navigation sits on its own row so it never competes with the brand */}
          <nav className="hidden pb-3 md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white text-ink-950"
                          : "text-white/55 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

      </header>

      <MobileMenuOverlay
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Platform console"
        brand={
          <>
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/10 text-white ring-1 ring-white/15">
              <Gauge className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] leading-tight font-semibold tracking-tight text-white">
                CarVyapar<span className="text-brand-300">.in</span>
              </span>
              <span className="flex items-center gap-1 text-[10px] tracking-[0.1em] text-white/40 uppercase">
                <ShieldCheck className="size-2.5" />
                Super Admin
              </span>
            </span>
          </>
        }
        footer={
          <div>
            <div className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.04] p-3">
              <Avatar name={user.name} src={user.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">{user.name}</p>
                <p className="truncate text-[12px] text-white/40">{user.email}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="flex size-10 items-center justify-center rounded-[10px] border border-white/10 text-white/50 transition-colors active:bg-danger-500/20 active:text-danger-200"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
        }
      >
        <div className="space-y-2 pt-1">
          {NAV.map((item, i) => (
            <MobileMenuItem
              key={item.href}
              href={item.href}
              label={item.label}
              description={item.hint}
              icon={<item.icon className="size-[18px]" />}
              active={isActive(item.href)}
              delay={70 + i * 45}
              onClick={() => setOpen(false)}
            />
          ))}
        </div>

        <div
          className="animate-menu-item mt-6 space-y-2"
          style={{ animationDelay: `${70 + NAV.length * 45}ms` }}
        >
          <p className="px-1 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-white/25 uppercase">
            Elsewhere
          </p>
          <MobileMenuItem
            href="/"
            label="Public website"
            description="carvyapar.in marketing site"
            icon={<Globe className="size-[18px]" />}
            external
            onClick={() => setOpen(false)}
          />
          <MobileMenuItem
            href="/d/sharma-auto"
            label="Demo showroom"
            description="See what a dealer's customers see"
            icon={<ExternalLink className="size-[18px]" />}
            external
            onClick={() => setOpen(false)}
          />
        </div>
      </MobileMenuOverlay>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
