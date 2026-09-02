#!/usr/bin/env node
/**
 * Grants role permissions added since a tenant was created.
 *
 * Permissions are stored per dealer, so shipping a new one (service.view, say)
 * leaves every existing role without it — owners quietly lose access to a new
 * part of their own CRM until somebody notices.
 *
 * Two fixes, both idempotent:
 *
 *   Dealer Owner roles are set to the "*" wildcard, so they hold every
 *   permission the product will ever add. This is also a bug fix: `can()`
 *   compares literally, so a role written as ["*"] by an older script granted
 *   nothing at all.
 *
 *   Other system roles get the new keys listed below, if they do not have them.
 *
 * Safe to run on every deploy. Rows that already match are left alone.
 *
 *   node scripts/backfill-permissions.mjs
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Permissions to add to existing system roles, by role key. */
const GRANTS = {
  branch_manager: ["service.view", "service.manage"],
  lead_manager: ["service.view"],
};

async function main() {
  let ownersFixed = 0;
  let rolesGranted = 0;

  const owners = await db.role.findMany({
    where: { key: "dealer_owner", isSystem: true },
    select: { id: true, permissions: true },
  });

  for (const role of owners) {
    let current;
    try {
      current = JSON.parse(role.permissions);
    } catch {
      current = [];
    }
    if (Array.isArray(current) && current.length === 1 && current[0] === "*") continue;
    await db.role.update({ where: { id: role.id }, data: { permissions: JSON.stringify(["*"]) } });
    ownersFixed += 1;
  }

  for (const [key, additions] of Object.entries(GRANTS)) {
    const roles = await db.role.findMany({ where: { key }, select: { id: true, permissions: true } });
    for (const role of roles) {
      let current;
      try {
        current = JSON.parse(role.permissions);
      } catch {
        current = [];
      }
      if (!Array.isArray(current)) continue;
      // A wildcard role already holds everything.
      if (current.includes("*")) continue;

      const missing = additions.filter((p) => !current.includes(p));
      if (!missing.length) continue;

      await db.role.update({
        where: { id: role.id },
        data: { permissions: JSON.stringify([...current, ...missing]) },
      });
      rolesGranted += 1;
    }
  }

  if (ownersFixed || rolesGranted) {
    console.log(
      `  permissions  ${ownersFixed} owner role(s) set to wildcard, ${rolesGranted} other role(s) updated`,
    );
  } else {
    console.log("  permissions  already up to date");
  }
}

main()
  .catch((error) => {
    console.error("Permission backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
