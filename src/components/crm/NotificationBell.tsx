"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Settings2, Phone, MessageCircle } from "lucide-react";
import { NotificationIcon } from "./NotificationIcon";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { relativeTime, telHref, whatsappHref, cn } from "@/lib/utils";

export type BellItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: string;
  category: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

/** How often the bell asks the server for news. */
const POLL_MS = 45_000;

/**
 * The notification centre.
 *
 * Polls a small JSON endpoint rather than holding a socket open, which keeps it
 * reliable on the patchy mobile connections dealers actually work on and costs
 * nothing when the tab is hidden. New arrivals can chime and raise a browser
 * notification, both of which the user controls in their preferences.
 */
export function NotificationBell({
  initialUnread,
  initialItems,
}: {
  initialUnread: number;
  initialItems: BellItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<BellItem[]>(initialItems);
  const [pulse, setPulse] = React.useState(false);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const since = React.useRef<string>(new Date().toISOString());
  const prefs = React.useRef({ sound: true, browserPush: false });
  const audio = React.useRef<(() => void) | null>(null);

  /* ---------------------------- sound ---------------------------- */

  // A short synthesised chime — no audio file to ship, and it degrades to
  // silence on browsers that block the Web Audio API.
  React.useEffect(() => {
    audio.current = () => {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.09);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
        setTimeout(() => void ctx.close(), 600);
      } catch {
        // Autoplay policy or an unsupported browser — silence is fine.
      }
    };
  }, []);

  /* ---------------------------- polling --------------------------- */

  const poll = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch(`/api/notifications?since=${encodeURIComponent(since.current)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        unread: number;
        now: string;
        sound: boolean;
        browserPush: boolean;
        items: BellItem[];
      };

      prefs.current = { sound: data.sound, browserPush: data.browserPush };

      const arrived = data.items.filter(
        (n) => new Date(n.createdAt) > new Date(since.current),
      );
      since.current = data.now;

      setUnread(data.unread);
      if (data.items.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...data.items.filter((n) => !seen.has(n.id)), ...prev];
          return merged.slice(0, 8);
        });
      }

      if (arrived.length) {
        setPulse(true);
        setTimeout(() => setPulse(false), 2000);
        if (data.sound) audio.current?.();
        raiseBrowserNotification(arrived, data.browserPush);
        // Keep server-rendered badges (sidebar counts, dashboard) honest.
        router.refresh();
      }
    } catch {
      // Offline or a dropped request — the next tick tries again.
    }
  }, [router]);

  React.useEffect(() => {
    const id = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  /* ------------------------- outside click ------------------------ */

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = () => {
    void markAllNotificationsRead().then(() => {
      setUnread(0);
      router.refresh();
    });
  };

  const openItem = (item: BellItem) => {
    setOpen(false);
    void markNotificationRead(item.id).then(() => {
      setUnread((u) => Math.max(0, u - 1));
      router.refresh();
    });
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-[9px] text-ink-600 transition-colors hover:bg-ink-100",
          open && "bg-ink-100",
        )}
      >
        <Bell className={cn("size-[18px]", pulse && "animate-bell")} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            // Full-width sheet on a phone, anchored panel on a desktop.
            "fixed inset-x-2 top-[60px] z-50 overflow-hidden rounded-[14px] border border-ink-200 bg-white shadow-lg",
            "sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[380px]",
          )}
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-ink-950">Notifications</p>
              <p className="text-[11.5px] text-ink-400">
                {unread ? `${unread} unread` : "You are all caught up"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  title="Mark all read"
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-500 hover:bg-ink-100"
                >
                  <CheckCheck className="size-4" />
                </button>
              )}
              <Link
                href="/settings/notifications"
                onClick={() => setOpen(false)}
                title="Notification settings"
                className="flex size-8 items-center justify-center rounded-[8px] text-ink-500 hover:bg-ink-100"
              >
                <Settings2 className="size-4" />
              </Link>
            </div>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {items.length ? (
              <ul className="divide-y divide-ink-100">
                {items.map((n) => {
                  const phone = typeof n.meta?.phone === "string" ? n.meta.phone : null;
                  const name =
                    typeof n.meta?.customerName === "string" ? n.meta.customerName : null;

                  return (
                    <li key={n.id} className="relative">
                      <Link
                        href={n.link ?? "/notifications"}
                        onClick={() => openItem(n)}
                        className="flex gap-3 px-4 py-3 transition-colors hover:bg-ink-50"
                      >
                        <NotificationIcon type={n.type} priority={n.priority} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug font-semibold text-ink-950">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-ink-400">
                            {relativeTime(n.createdAt)}
                          </p>
                        </div>
                      </Link>

                      {/* Act without leaving the panel — the whole point of a bell. */}
                      {phone && (
                        <div className="absolute top-3 right-3 flex gap-1">
                          <a
                            href={telHref(phone)}
                            aria-label={`Call ${name ?? "customer"}`}
                            onClick={() => openItem(n)}
                            className="flex size-7 items-center justify-center rounded-[7px] border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                          >
                            <Phone className="size-3.5" />
                          </a>
                          <a
                            href={whatsappHref(
                              phone,
                              name ? `Hi ${name.split(" ")[0]}, ` : undefined,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="WhatsApp"
                            onClick={() => openItem(n)}
                            className="flex size-7 items-center justify-center rounded-[7px] bg-success-600 text-white hover:bg-success-700"
                          >
                            <MessageCircle className="size-3.5" />
                          </a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-10 text-center">
                <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                  <Bell className="size-5" />
                </span>
                <p className="text-[13.5px] font-medium text-ink-800">Nothing needs you</p>
                <p className="mx-auto mt-1 max-w-[240px] text-[12px] leading-relaxed text-ink-500">
                  New enquiries, due follow-ups and stock alerts land here the moment they happen.
                </p>
              </div>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 py-2.5 text-center text-[12.5px] font-medium text-brand-700 hover:bg-ink-50"
          >
            See everything
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Raises a native browser notification for genuinely new items. Permission is
 * requested from the settings screen, never silently here, so the browser does
 * not treat it as an unprompted request and block it outright.
 */
function raiseBrowserNotification(items: BellItem[], enabled: boolean) {
  if (!enabled) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // One summary rather than a stack of five, which people dismiss without reading.
  const first = items[0];
  const extra = items.length - 1;

  try {
    const notification = new Notification(
      extra > 0 ? `${first.title} · and ${extra} more` : first.title,
      {
        body: first.body ?? undefined,
        tag: "carvyapar-notifications",
        icon: "/favicon.ico",
        requireInteraction: items.some((i) => i.priority === "critical"),
      },
    );
    notification.onclick = () => {
      window.focus();
      if (first.link) window.location.href = first.link;
      notification.close();
    };
  } catch {
    // Some mobile browsers only allow this from a service worker.
  }
}
