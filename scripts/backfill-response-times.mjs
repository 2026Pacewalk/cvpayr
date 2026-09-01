/* eslint-disable no-console */
/**
 * One-off backfill for the lead response-time fields added in the CRM upgrade.
 *
 * `firstResponseAt` and `firstContactAt` are new columns, so every pre-existing
 * lead starts as NULL — which makes the SLA dashboard report the entire back
 * catalogue as "never answered". This reconstructs both timestamps from the
 * activity history that was already being recorded.
 *
 * Safe to run repeatedly: it only touches leads where the field is still NULL.
 *
 *   node scripts/backfill-response-times.mjs          # report only
 *   node scripts/backfill-response-times.mjs --apply  # write the changes
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

// Activity types that prove a human on the dealer side reached out.
const OUTBOUND = ["call", "whatsapp", "email", "sms", "follow_up"];
// A connected call is the only activity that proves the customer was reached.
const CONTACT_TITLE = /connected|call outcome/i;

async function main() {
  const leads = await db.lead.findMany({
    where: { OR: [{ firstResponseAt: null }, { firstContactAt: null }] },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      firstResponseAt: true,
      firstContactAt: true,
      stage: true,
      activities: {
        orderBy: { createdAt: "asc" },
        select: { type: true, title: true, createdAt: true, userId: true },
      },
    },
  });

  let responseFills = 0;
  let contactFills = 0;
  let skipped = 0;

  for (const lead of leads) {
    const outbound = lead.activities.filter(
      (a) => OUTBOUND.includes(a.type) || a.type === "assignment",
    );

    // The earliest genuine outbound touch. Assignment alone is not a response,
    // so it is only used when nothing better exists and the lead has clearly
    // moved past "new" — otherwise we would invent a response that never happened.
    const firstOutbound =
      outbound.find((a) => OUTBOUND.includes(a.type)) ??
      (lead.stage !== "new" ? outbound[0] : undefined);

    const firstContact = lead.activities.find(
      (a) => a.type === "call" && CONTACT_TITLE.test(a.title),
    );

    const data = {};
    if (!lead.firstResponseAt && firstOutbound) {
      data.firstResponseAt = firstOutbound.createdAt;
      responseFills++;
    }
    if (!lead.firstContactAt && firstContact) {
      data.firstContactAt = firstContact.createdAt;
      contactFills++;
    }

    if (!Object.keys(data).length) {
      skipped++;
      continue;
    }

    if (apply) {
      await db.lead.update({ where: { id: lead.id }, data });
    }
  }

  console.log(`Leads examined:            ${leads.length}`);
  console.log(`firstResponseAt to fill:   ${responseFills}`);
  console.log(`firstContactAt to fill:    ${contactFills}`);
  console.log(`Left as genuinely unanswered: ${skipped}`);
  console.log(
    apply
      ? "\nChanges written."
      : "\nDry run — nothing written. Re-run with --apply to commit.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
