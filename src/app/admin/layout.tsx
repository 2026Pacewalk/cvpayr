import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { superAdminUnread } from "@/server/notifications";

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
