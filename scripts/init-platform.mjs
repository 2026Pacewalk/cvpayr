#!/usr/bin/env node
/**
 * Prepares an empty production database for real use.
 *
 * `npm run db:seed` is for demos: it wipes everything and inserts a fictional
 * dealership whose every password is "password123". This does the opposite —
 * it never deletes anything, and it creates only what the platform genuinely
 * cannot run without:
 *
 *   1. The three subscription plans, so a dealership can be created at all
 *   2. Your super admin login
 *
 * Safe to re-run. Existing plans are left alone, and an existing admin has only
 * their password reset (with confirmation via --force).
 *
 * Usage:
 *   node scripts/init-platform.mjs --email you@carvyapar.in --name "Your Name"
 *
 * The password is generated and printed once. Copy it, sign in, change it.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}

const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const name = arg("name") ?? process.env.ADMIN_NAME ?? "Platform Admin";
const force = process.argv.includes("--force");

if (!email || !email.includes("@")) {
  console.error("Give the admin email address:");
  console.error('  node scripts/init-platform.mjs --email you@carvyapar.in --name "Your Name"');
  process.exit(1);
}

/** Readable but strong: 4 groups of 5 from an unambiguous alphabet. */
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

/** 10% off a yearly plan, matching src/lib/billing.ts. */
const yearly = (monthly) => Math.round(monthly * 12 * 0.9);

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "For single-showroom dealers getting online.",
    priceMonthly: 1499,
    sortOrder: 1,
    maxBranches: 1,
    maxUsers: 3,
    maxVehicles: 50,
    maxImagesPerVehicle: 15,
    storageMb: 2048,
    features: {
      crm: true, customDomain: false, advancedReports: false,
      customBranding: false, apiAccess: false, prioritySupport: false, bulkImport: false,
    },
  },
  {
    code: "professional",
    name: "Professional",
    description: "Multi-branch dealerships running a real sales team.",
    priceMonthly: 3999,
    sortOrder: 2,
    maxBranches: 5,
    maxUsers: 15,
    maxVehicles: 300,
    maxImagesPerVehicle: 30,
    storageMb: 10240,
    features: {
      crm: true, customDomain: false, advancedReports: true,
      customBranding: true, apiAccess: false, prioritySupport: false, bulkImport: true,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Large groups with custom domains and integrations.",
    priceMonthly: 9999,
    sortOrder: 3,
    maxBranches: -1,
    maxUsers: -1,
    maxVehicles: -1,
    maxImagesPerVehicle: 60,
    storageMb: 102400,
    features: {
      crm: true, customDomain: true, advancedReports: true,
      customBranding: true, apiAccess: true, prioritySupport: true, bulkImport: true,
    },
  },
];

async function main() {
  console.log("Preparing the platform…\n");

  // ---- Plans -------------------------------------------------------
  let created = 0;
  for (const plan of PLANS) {
    const exists = await db.plan.findUnique({ where: { code: plan.code } });
    if (exists) {
      console.log(`  plan ${plan.code.padEnd(13)} already exists, left as it is`);
      continue;
    }
    const { features, priceMonthly, ...rest } = plan;
    await db.plan.create({
      data: {
        ...rest,
        priceMonthly,
        priceYearly: yearly(priceMonthly),
        features: JSON.stringify(features),
      },
    });
    console.log(`  plan ${plan.code.padEnd(13)} created`);
    created += 1;
  }

  // ---- Super admin -------------------------------------------------
  const existing = await db.user.findUnique({ where: { email } });

  if (existing && !force) {
    console.log(`\n  ${email} already exists.`);
    console.log("  Re-run with --force to reset its password.\n");
    if (created) console.log("Plans were created. Nothing else changed.");
    return;
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await db.user.update({
      where: { email },
      data: { passwordHash, isActive: true, isSuperAdmin: true },
    });
    console.log(`\n  password reset for ${email}`);
  } else {
    await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        isSuperAdmin: true,
        designation: "Platform Operations",
      },
    });
    console.log(`\n  super admin created: ${email}`);
  }

  console.log("\n────────────────────────────────────────────────");
  console.log("  Sign in at  https://carvyapar.in/login");
  console.log(`  Email       ${email}`);
  console.log(`  Password    ${password}`);
  console.log("────────────────────────────────────────────────");
  console.log("\nThis password is shown once. Copy it now, then change it after");
  console.log("signing in. Next step: /admin/dealers to create your first");
  console.log("dealership — its slug becomes carvyapar.in/d/<slug>.\n");
}

main()
  .catch((error) => {
    console.error("\nFailed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
