#!/usr/bin/env node
/**
 * Creates a dealership from the command line.
 *
 * The admin console can do this too; this exists for setting one up on a server
 * before anyone has signed in, and for scripting a batch of them.
 *
 * Credentials are read from the environment, never from arguments, so a gateway
 * password does not end up in your shell history or in `ps`.
 *
 *   node scripts/create-dealer.mjs \
 *     --name "Berkeley Hyundai" --slug berkeley-hyundai \
 *     --city Kolkata --state "West Bengal" \
 *     --owner-name "Owner Name" --owner-email owner@berkeleyhyundai.in \
 *     --phone 9800000000 --plan professional
 *
 * To configure SMS at the same time, set these first:
 *   SMS_USERNAME, SMS_PASSWORD, SMS_SENDER_ID, SMS_IVR_NUMBER
 *
 * Safe to re-run: an existing slug is updated rather than duplicated, and an
 * existing owner account is left alone.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}

const name = arg("name");
const slug = (arg("slug") ?? (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(
  /(^-|-$)/g,
  "",
);
const city = arg("city");
const state = arg("state");
const phone = (arg("phone") ?? "").replace(/\D/g, "") || null;
const email = arg("email");
const ownerName = arg("owner-name") ?? "Dealer Owner";
const ownerEmail = (arg("owner-email") ?? "").toLowerCase();
const planCode = arg("plan", "professional");

if (!name || !ownerEmail) {
  console.error("Required: --name and --owner-email");
  console.error('  node scripts/create-dealer.mjs --name "Berkeley Hyundai" --owner-email owner@example.in');
  process.exit(1);
}

function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

const ROLE_TEMPLATES = [
  { key: "dealer_owner", name: "Dealer Owner", description: "Full access to everything." },
  { key: "branch_manager", name: "Branch Manager", description: "Runs one or more branches." },
  { key: "inventory_manager", name: "Inventory Manager", description: "Stock and pricing." },
  { key: "sales_executive", name: "Sales Executive", description: "Their own leads." },
  { key: "lead_manager", name: "Lead Manager", description: "The whole pipeline." },
  { key: "viewer", name: "View Only", description: "Read-only access." },
];

async function main() {
  const plan =
    (await db.plan.findUnique({ where: { code: planCode } })) ??
    (await db.plan.findFirst({ orderBy: { sortOrder: "asc" } }));

  if (!plan) {
    console.error("No subscription plans exist. Run: node scripts/init-platform.mjs --email you@…");
    process.exit(1);
  }

  const existing = await db.dealer.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Dealership "${slug}" already exists — updating its details only.`);
  }

  const dealer = existing
    ? await db.dealer.update({
        where: { id: existing.id },
        data: { name, city, state, phone, whatsapp: phone, email },
      })
    : await db.dealer.create({
        data: {
          slug,
          name,
          city,
          state,
          phone,
          whatsapp: phone,
          email,
          contactPerson: ownerName,
          status: "active",
        },
      });

  console.log(`\n  dealership   ${dealer.name}  →  /d/${dealer.slug}`);

  // --- Roles, branch, subscription, website ---------------------------
  const roles = {};
  for (const t of ROLE_TEMPLATES) {
    const role = await db.role.upsert({
      where: { dealerId_key: { dealerId: dealer.id, key: t.key } },
      create: {
        dealerId: dealer.id,
        key: t.key,
        name: t.name,
        description: t.description,
        isSystem: true,
        // The owner gets everything; the rest are edited in Roles & Access.
        permissions: JSON.stringify(t.key === "dealer_owner" ? ["*"] : []),
      },
      update: {},
    });
    roles[t.key] = role.id;
  }

  await db.subscription.upsert({
    where: { dealerId: dealer.id },
    create: {
      dealerId: dealer.id,
      planId: plan.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
    update: {},
  });

  await db.websiteSettings.upsert({
    where: { dealerId: dealer.id },
    create: { dealerId: dealer.id },
    update: {},
  });

  const branchCount = await db.branch.count({ where: { dealerId: dealer.id } });
  if (!branchCount) {
    await db.branch.create({
      data: {
        dealerId: dealer.id,
        code: "MAIN",
        name: `${name} — Main Showroom`,
        city: city || "—",
        state,
        phone,
        sortOrder: 1,
      },
    });
    console.log(`  branch       ${name} — Main Showroom`);
  }

  // --- Owner login ----------------------------------------------------
  const owner = await db.user.findUnique({ where: { email: ownerEmail } });
  let ownerPassword = null;
  if (owner) {
    console.log(`  owner        ${ownerEmail} already exists, left as it is`);
  } else {
    ownerPassword = generatePassword();
    await db.user.create({
      data: {
        dealerId: dealer.id,
        roleId: roles.dealer_owner,
        name: ownerName,
        email: ownerEmail,
        phone,
        designation: "Dealer Owner",
        passwordHash: await bcrypt.hash(ownerPassword, 10),
      },
    });
    console.log(`  owner        ${ownerEmail}`);
  }

  // --- SMS, only if credentials were supplied in the environment ------
  const smsUser = process.env.SMS_USERNAME;
  const smsPass = process.env.SMS_PASSWORD;
  const smsFrom = process.env.SMS_SENDER_ID;

  if (smsUser && smsPass && smsFrom) {
    await db.smsSettings.upsert({
      where: { dealerId: dealer.id },
      create: {
        dealerId: dealer.id,
        provider: "smartping",
        username: smsUser,
        password: smsPass,
        senderId: smsFrom.toUpperCase(),
        ivrNumber: process.env.SMS_IVR_NUMBER ?? null,
        // Left off deliberately: switch it on from the UI once a test message
        // has actually arrived, so nobody is messaged by an untested setup.
        isActive: false,
      },
      update: {
        username: smsUser,
        password: smsPass,
        senderId: smsFrom.toUpperCase(),
        ...(process.env.SMS_IVR_NUMBER ? { ivrNumber: process.env.SMS_IVR_NUMBER } : {}),
      },
    });
    console.log(`  sms          ${smsUser} · sender ${smsFrom.toUpperCase()} · sending OFF until tested`);
  } else {
    console.log("  sms          not configured (set SMS_USERNAME, SMS_PASSWORD, SMS_SENDER_ID)");
  }

  if (ownerPassword) {
    console.log("\n────────────────────────────────────────────────");
    console.log(`  Sign in     ${ownerEmail}`);
    console.log(`  Password    ${ownerPassword}`);
    console.log("────────────────────────────────────────────────");
    console.log("  Shown once. Change it after signing in.\n");
  } else {
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error("\nFailed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
