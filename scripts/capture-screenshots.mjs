/**
 * Captures the product screenshots used on the marketing home page.
 *
 *   npm run dev                        # must already be running
 *   node scripts/capture-screenshots.mjs
 *
 * Drives the system Chrome over the DevTools Protocol rather than pulling in
 * Playwright: this runs a handful of times a year, and a headless-browser
 * dependency is a large thing to carry for that.
 *
 * The CRM shots need a signed-in session. Rather than driving the login form,
 * it mints the same HS256 cookie the app issues and sets it directly — the
 * form is not what is being tested here, and a scripted login is one more
 * thing to break.
 *
 * It signs in as the SEED dealer only. Never point this at a real dealership:
 * these images are published on a public page.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "screenshots");

const ORIGIN = process.env.CAPTURE_ORIGIN ?? "http://localhost:3201";
const PORT = 9333;
const WIDTH = 1440;
const HEIGHT = 900;

/** The seed dealership. Guard rail: nothing else may be captured. */
const SEED_DEALER = "sharma-auto";
const SEED_USER = "owner@sharmaautowheels.in";

const SHOTS = [
  { name: "showroom", path: `/d/${SEED_DEALER}`, auth: false, settle: 3500 },
  { name: "pipeline", path: "/leads/pipeline", auth: true, settle: 3500 },
  { name: "reports", path: "/reports", auth: true, settle: 6000 },
];

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ CDP client ----------------------------- */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 60_000);
    });
  }
  once(method) {
    return new Promise((resolve) => {
      const fns = this.listeners.get(method) ?? [];
      const fn = (p) => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((f) => f !== fn));
        resolve(p);
      };
      this.listeners.set(method, [...fns, fn]);
    });
  }
}

/* -------------------------------- main --------------------------------- */

async function sessionCookie() {
  const env = await readFile(join(root, ".env"), "utf8");
  const secret = env.match(/^\s*AUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
  if (!secret) throw new Error("AUTH_SECRET not found in .env");

  const db = new PrismaClient();
  const user = await db.user.findFirst({
    where: { email: SEED_USER, dealer: { slug: SEED_DEALER } },
    select: { id: true, dealer: { select: { slug: true, name: true } } },
  });
  await db.$disconnect();
  if (!user) throw new Error(`Seed user ${SEED_USER} not found — run npm run db:seed`);
  if (user.dealer.slug !== SEED_DEALER) throw new Error("refusing: not the seed dealer");

  console.log(`  signed in as ${SEED_USER} (${user.dealer.name})`);
  return new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

async function main() {
  if (!CHROME) throw new Error("No Chrome or Edge found");
  await mkdir(OUT, { recursive: true });

  const token = await sessionCookie();

  // Warm every route first: a dev server compiles on first hit, and a shot
  // taken mid-compile is a blank page.
  console.log("  warming routes…");
  for (const s of SHOTS) {
    await fetch(`${ORIGIN}${s.path}`, { headers: { cookie: `carvyapar_session=${token}` } }).catch(
      () => {},
    );
  }

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${join(root, "node_modules", ".cache", "capture-profile")}`,
    "about:blank",
  ]);
  chrome.on("error", (e) => console.error(e));

  let target;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error("Chrome did not expose a debugging target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const cdp = new Cdp(ws);

  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    // 2x so the image is still crisp on a retina screen after downscaling.
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send("Network.setCookie", {
    name: "carvyapar_session",
    value: token,
    url: ORIGIN,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });

  for (const shot of SHOTS) {
    process.stdout.write(`  ${shot.name.padEnd(10)} ${shot.path} … `);
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: `${ORIGIN}${shot.path}` });
    await Promise.race([loaded, sleep(30_000)]);

    // The dev server paints its own indicator over the bottom-left corner.
    // It is not part of the product, so it must not appear in a product shot.
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important}";
        document.head.appendChild(s);
      })()`,
    });

    await sleep(shot.settle);

    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });

    const file = join(OUT, `${shot.name}.webp`);
    await sharp(Buffer.from(data, "base64"))
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "top" })
      .webp({ quality: 86 })
      .toFile(file);

    const { size } = await sharp(file).metadata();
    console.log(`${WIDTH}x${HEIGHT} webp`);
  }

  ws.close();
  chrome.kill();
  console.log(`\n  Written to public/screenshots/`);
}

main().catch((e) => {
  console.error("\n", e.message);
  process.exit(1);
});
