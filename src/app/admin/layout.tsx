import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { superAdminUnread } from "@/server/notifications";

// Behind a login and disallowed in robots.txt already. This is the third lock:
// nothing in here should ever reach an index, whichever of the other two fails.
export const metadata: Metadata = { robots: { index: false, follow: false } };


export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const unread = await superAdminUnread(user.id);

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
      unreadCount={unread}
    >
      {children}
    </AdminShell>
  );
}
