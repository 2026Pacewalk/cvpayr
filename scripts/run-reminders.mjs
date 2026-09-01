#!/usr/bin/env node
/**
 * Runs the scheduled reminder sweep against a running instance.
 *
 * Usage:
 *   node scripts/run-reminders.mjs                     # all jobs, every dealer
 *   node scripts/run-reminders.mjs --jobs followups,sla
 *   node scripts/run-reminders.mjs --url https://app.example.com
 *   node scripts/run-reminders.mjs --at 2026-08-31T03:35:00Z   # dev only: 9:05am IST
 *
 * Put this in cron to keep reminders firing when nobody has the CRM open:
 *   *\/10 * * * * cd /srv/carvyapar && node scripts/run-reminders.mjs >> /var/log/carvyapar-reminders.log 2>&1
 *
 * Everything it triggers is idempotent, so an overlapping or repeated run
 * cannot produce duplicate notifications.
 */

import { readFileSync } from "node:fs";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, raw] = match;
        if (process.env[key] !== undefined) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
    } catch {
      // File missing is fine — the variables may come from the environment.
    }
  }
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

loadEnv();

const base = arg("url", process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const jobs = arg("jobs", null);
const dealerId = arg("dealer", null);
// Development only: pretend it is a different moment, to exercise the
// morning-only jobs. The server ignores it in production.
const at = arg("at", null);

const params = new URLSearchParams();
if (jobs) params.set("jobs", jobs);
if (dealerId) params.set("dealerId", dealerId);
if (at) params.set("at", at);

const url = `${base}/api/cron/reminders${params.size ? `?${params}` : ""}`;

const headers = { "Content-Type": "application/json" };
if (process.env.CRON_SECRET) headers["x-cron-secret"] = process.env.CRON_SECRET;

console.log(`→ ${url}`);

try {
  const response = await fetch(url, { method: "POST", headers });
  const text = await response.text();

  if (!response.ok) {
    console.error(`✖ ${response.status} ${text.slice(0, 400)}`);
    process.exit(1);
  }

  const report = JSON.parse(text);
  const worked = report.jobs.filter((j) => j.created > 0);
  const failed = report.jobs.filter((j) => j.error);

  console.log(
    `✔ ${report.dealers} dealership(s) · ${report.created} notification(s) created · ${report.purged} expired row(s) purged`,
  );
  for (const j of worked) console.log(`  ${j.job.padEnd(12)} +${j.created}`);
  for (const j of failed) console.error(`  ${j.job.padEnd(12)} ERROR ${j.error}`);

  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error(`✖ Could not reach ${url}`);
  console.error(`  ${error.message}`);
  console.error("  Is the app running? Set --url or APP_URL if it is on another host.");
  process.exit(1);
}
