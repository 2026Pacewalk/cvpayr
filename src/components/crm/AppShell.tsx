"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Car, Building2, Users, UserSquare2, CalendarClock, Handshake,
  BarChart3, Settings, Bell, Menu, X, Search, LogOut, Globe, ShieldCheck, Zap,
  KanbanSquare, ChevronDown, PlusCircle, ScrollText, Target, Flame,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar } from "@/components/ui/primitives";
import { Popover, MenuItem } from "@/components/ui/Overlay";
import { logoutAction } from "@/app/actions/auth";
import { NotificationBell, type BellItem } from "./NotificationBell";

const ICONS = {
  dashboard: LayoutDashboard,
  attention: Flame,
  inventory: Car,
  quickSearch: Zap,
  branches: Building2,
  leads: KanbanSquare,
  customers: Users,
  followUps: CalendarClock,
  testDrives: UserSquare2,
  requirements: Target,
  sales: Handshake,
  staff: Users,
  reports: BarChart3,
  settings: Settings,
  website: Globe,
  audit: ScrollText,
  roles: ShieldCheck,
} as const;

export type NavItem = {
  key: keyof typeof ICONS;
  href: string;
  label: string;
  badge?: number;
  group: "main" | "sales" | "org";
};

export type ShellUser = {
  name: string;
  email: string;
  roleName: string | null;
  avatarUrl: string | null;
  dealerName: string | null;
  dealerSlug: string | null;
  planName: string;
  planStatus: string;
};

const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "Operations",
  sales: "Sales & CRM",
  org: "Organisation",
};

export function AppShell({
  nav,
  user,
  unreadCount,
  recentNotifications = [],
  canAddVehicle,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  unreadCount: number;
  recentNotifications?: BellItem[];
  /** Gates the top-bar shortcut so no role sees an action it cannot complete. */
  canAddVehicle: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const groups = (["main", "sales", "org"] as const)
    .map((g) => ({ group: g, items: nav.filter((n) => n.group === g) }))
    .filter((g) => g.items.length);

  /** The five most useful destinations get a permanent home on the phone tab bar. */
  const mobileTabs = nav
    .filter((n) => ["dashboard", "inventory", "leads", "followUps", "reports"].includes(n.key))
    .slice(0, 5);

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* ───────────────────────── SIDEBAR ───────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-ink-200 bg-white transition-transform duration-200 lg:translate-x-0",
          menuOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-100 px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink-900 text-[13px] font-semibold text-white">
            {initials(user.dealerName ?? "CarVyapar")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14px] leading-tight font-semibold text-ink-950">
              {user.dealerName ?? "CarVyapar"}
            </p>
            <p className="truncate text-[11.5px] text-ink-400">
              {user.planName} · {user.planStatus}
            </p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="flex size-8 items-center justify-center rounded-[8px] text-ink-500 hover:bg-ink-100 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g, gi) => (
            <div key={g.group} className={cn(gi > 0 && "mt-6")}>
              <p className="px-2.5 pb-2 text-[10.5px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                {GROUP_LABELS[g.group]}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                          active
                            ? "bg-ink-900 text-white"
                            : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-[17px] shrink-0",
                            active ? "text-white" : "text-ink-400 group-hover:text-ink-600",
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
                              active ? "bg-white/15 text-white" : "bg-danger-50 text-danger-700",
                            )}
                          >
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-100 p-3">
          {user.dealerSlug && (
            <Link
              href={`/d/${user.dealerSlug}`}
              target="_blank"
              className="mb-2 flex items-center gap-2.5 rounded-[9px] border border-ink-200 px-2.5 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
            >
              <Globe className="size-4 text-ink-400" />
              View public site
            </Link>
          )}
          <div className="flex items-center gap-2.5 rounded-[9px] px-1 py-1.5">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-900">{user.name}</p>
              <p className="truncate text-[11.5px] text-ink-400">{user.roleName}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="flex size-8 items-center justify-center rounded-[8px] text-ink-400 hover:bg-ink-100 hover:text-danger-600"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-ink-950/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      {/* ───────────────────────── MAIN ───────────────────────── */}
      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-ink-600 hover:bg-ink-100 lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <GlobalSearchTrigger />

            <div className="ml-auto flex items-center gap-1.5">
              {canAddVehicle && (
                <Link
                  href="/inventory/new"
                  className="hidden h-9 items-center gap-1.5 rounded-[9px] bg-brand-600 px-3.5 text-[13px] font-medium text-white hover:bg-brand-700 sm:inline-flex"
                >
                  <PlusCircle className="size-4" />
                  Add vehicle
                </Link>
              )}
              <NotificationBell
                initialUnread={unreadCount}
                initialItems={recentNotifications}
              />

              <Popover
                trigger={({ toggle }) => (
                  <button
                    onClick={toggle}
                    className="flex items-center gap-1.5 rounded-[9px] p-1 hover:bg-ink-100"
                    aria-label="Account menu"
                  >
                    <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                    <ChevronDown className="size-3.5 text-ink-400" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <div className="border-b border-ink-100 px-2.5 pt-1 pb-2.5">
                      <p className="text-[13px] font-semibold text-ink-900">{user.name}</p>
                      <p className="truncate text-[11.5px] text-ink-400">{user.email}</p>
                      <p className="mt-1 text-[11.5px] text-brand-700">{user.roleName}</p>
                    </div>
                    <div className="pt-1.5">
                      <Link href="/settings" onClick={close}>
                        <MenuItem icon={<Settings className="size-4" />}>Settings</MenuItem>
                      </Link>
                      {user.dealerSlug && (
                        <a href={`/d/${user.dealerSlug}`} target="_blank" rel="noopener noreferrer" onClick={close}>
                          <MenuItem icon={<Globe className="size-4" />}>Public website</MenuItem>
                        </a>
                      )}
                      <form action={logoutAction}>
                        <MenuItem icon={<LogOut className="size-4" />} destructive type="submit">
                          Sign out
                        </MenuItem>
                      </form>
                    </div>
                  </>
                )}
              </Popover>
            </div>
          </div>
        </header>

        <main className="px-4 pt-5 pb-24 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* ───────────────────── MOBILE TAB BAR ───────────────────── */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:hidden">
        <ul className="flex items-stretch">
          {mobileTabs.map((item) => {
            const Icon = ICONS[item.key];
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                    active ? "text-brand-700" : "text-ink-400",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-[19px]" />
                    {item.badge ? (
                      <span className="absolute -top-1 -right-2 flex min-w-3.5 items-center justify-center rounded-full bg-danger-600 px-1 text-[9px] font-semibold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate px-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function GlobalSearchTrigger() {
  return (
    <Link
      href="/search"
      className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-ink-200 bg-ink-50 px-3 text-[13px] text-ink-400 transition-colors hover:border-ink-300 hover:bg-white sm:max-w-sm"
    >
      <Search className="size-4 shrink-0" />
      <span className="truncate">Search vehicles, leads, customers…</span>
    </Link>
  );
}
