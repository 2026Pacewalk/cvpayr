import "server-only";
import { db } from "@/lib/db";

/**
 * Audit logging, and the compatibility surface for notifications.
 *
 * The notification engine itself lives in `src/server/notifications.ts`. This
 * module re-exports `notify` / `notifyRoles` so the call sites written before
 * the engine existed keep working unchanged.
 */

export { notify, notifyRoles, notifyRecipients, notifySuperAdmins } from "./notifications";
export type { NotifyInput, RecipientQuery } from "./notifications";
export type { NotificationType } from "@/lib/notifications";

/** Delivery channels. Only `in_app` is implemented; see the notification settings screen. */
export type NotifyChannel = "in_app" | "email" | "whatsapp" | "sms" | "push";

export async function audit(input: {
  dealerId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  diff?: unknown;
}) {
  return db.auditLog.create({
    data: {
      dealerId: input.dealerId,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      diff: input.diff ? JSON.stringify(input.diff) : null,
    },
  });
}

/** Compare two records and return only the changed fields, for audit diffs. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (norm(a) !== norm(b)) changes[key] = { from: norm(a), to: norm(b) };
  }
  return changes;
}
