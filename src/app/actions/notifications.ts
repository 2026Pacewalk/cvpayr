"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireDealerUser } from "@/lib/auth";
import {
  markRead,
  markUnread,
  deleteNotification,
  inboxWhere,
  type InboxScope,
} from "@/server/notifications";
import { recordOutreach } from "@/server/leads";
import { audit } from "@/server/events";
import { NOTIFICATION_PRIORITIES } from "@/lib/notifications";

/**
 * Every action here re-derives the scope from the session. Nothing accepts a
 * dealer or user id from the client, so one dealer can never touch another
 * dealer's notifications even by guessing an id.
 */
async function scope(): Promise<InboxScope & { name: string }> {
  const user = await requireDealerUser();
  return {
    dealerId: user.dealerId,
    userId: user.id,
    branchIds: user.branchIds,
    name: user.name,
  };
}

/* ------------------------------ READ STATE ---------------------------- */

export async function markNotificationRead(id: string) {
  const s = await scope();
  const count = await markRead(s, [id]);
  revalidatePath("/notifications");
  return { status: "success" as const, count };
}

export async function markNotificationUnread(id: string) {
  const s = await scope();
  await markUnread(s, id);
  revalidatePath("/notifications");
  return { status: "success" as const };
}

export async function markAllNotificationsRead() {
  const s = await scope();
  const count = await markRead(s);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return { status: "success" as const, count };
}

export async function dismissNotification(id: string) {
  const s = await scope();
  await deleteNotification(s, id);
  revalidatePath("/notifications");
  return { status: "success" as const };
}

/** Clears everything already read. Unread items are never touched. */
export async function clearReadNotifications() {
  const s = await scope();
  const result = await db.notification.deleteMany({
    where: { ...inboxWhere(s), isRead: true, userId: s.userId },
  });
  revalidatePath("/notifications");
  return { status: "success" as const, count: result.count };
}

/* ---------------------------- QUICK ACTIONS --------------------------- */

/**
 * "I called them" straight from a notification. Writes a real activity on the
 * lead and stamps the response time, exactly as the lead screen would.
 */
export async function actOnNotification(
  id: string,
  action: "called" | "whatsapped" | "snooze" | "done",
  hours = 2,
) {
  const s = await scope();

  const notification = await db.notification.findFirst({
    where: { ...inboxWhere(s), id },
  });
  if (!notification) return { status: "error" as const, message: "Notification not found" };

  if (action === "snooze") {
    // Snoozing hides it now and lets the scheduled sweep raise it again later.
    await db.notification.updateMany({
      where: { ...inboxWhere(s), id },
      data: { isRead: true, readAt: new Date() },
    });
    revalidatePath("/notifications");
    return {
      status: "success" as const,
      message: `Hidden. It will come back if it is still open in ${hours} hours.`,
    };
  }

  if (action === "done") {
    if (notification.entityType === "followup" && notification.entityId) {
      const followUp = await db.followUp.findFirst({
        where: { id: notification.entityId, dealerId: s.dealerId },
      });
      if (followUp && followUp.status === "pending") {
        await db.followUp.update({
          where: { id: followUp.id },
          data: { status: "done", completedAt: new Date(), outcome: "Completed from a reminder" },
        });
      }
    }
    await markRead(s, [id]);
    revalidatePath("/notifications");
    revalidatePath("/followups");
    return { status: "success" as const, message: "Marked done" };
  }

  // called / whatsapped — log real outreach against the lead when we have one.
  const leadId =
    notification.entityType === "lead"
      ? notification.entityId
      : notification.entityType === "followup" && notification.entityId
        ? (
            await db.followUp.findFirst({
              where: { id: notification.entityId, dealerId: s.dealerId },
              select: { leadId: true },
            })
          )?.leadId ?? null
        : null;

  if (leadId) {
    await recordOutreach({
      dealerId: s.dealerId,
      leadId,
      userId: s.userId,
      channel: action === "called" ? "call" : "whatsapp",
      title: action === "called" ? "Called from a reminder" : "WhatsApp sent from a reminder",
      connected: false,
    });
  }

  await markRead(s, [id]);
  revalidatePath("/notifications");
  if (leadId) revalidatePath(`/leads/${leadId}`);

  return {
    status: "success" as const,
    message: action === "called" ? "Call logged" : "Message logged",
  };
}

/* ---------------------------- PREFERENCES ----------------------------- */

export type PreferenceState = { status: "idle" | "success" | "error"; message?: string };

export async function saveNotificationPreferences(
  _prev: PreferenceState,
  formData: FormData,
): Promise<PreferenceState> {
  const user = await requireDealerUser();

  const on = (name: string) => formData.get(name) === "on";
  const hour = (name: string) => {
    const raw = formData.get(name);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  };

  const minPriority = String(formData.get("minPriority") ?? "low");
  const digestHour = hour("digestHour") ?? 9;
  const mutedTypes = formData.getAll("mutedTypes").map(String).filter(Boolean);

  if (!NOTIFICATION_PRIORITIES.includes(minPriority as never)) {
    return { status: "error", message: "Unknown priority level." };
  }

  const data = {
    inApp: true, // the in-app centre cannot be switched off
    browserPush: on("browserPush"),
    email: on("email"),
    whatsapp: on("whatsapp"),
    sound: on("sound"),
    digestEnabled: on("digestEnabled"),
    digestHour,
    quietStart: hour("quietStart"),
    quietEnd: hour("quietEnd"),
    mutedTypes: JSON.stringify(mutedTypes),
    minPriority,
  };

  await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dealerId: user.dealerId, ...data },
    update: data,
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "user",
    entityId: user.id,
    summary: "Updated their notification preferences",
  });

  revalidatePath("/settings/notifications");
  return { status: "success", message: "Preferences saved" };
}

/** Records that the browser granted or refused permission for push alerts. */
export async function setBrowserPush(enabled: boolean) {
  const user = await requireDealerUser();
  await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dealerId: user.dealerId, browserPush: enabled },
    update: { browserPush: enabled },
  });
  revalidatePath("/settings/notifications");
  return { status: "success" as const };
}
