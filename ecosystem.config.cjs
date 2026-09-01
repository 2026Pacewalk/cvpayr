/**
 * PM2 process definition.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * The port is read out of .env by this file directly.
 *
 * That is deliberate, and it is the second thing that went wrong on a real
 * deploy. PM2 does not load .env, and `PORT=3201 ... && pm2 start` only sets a
 * shell variable — without `export` it never reaches the PM2 process either. So
 * reading `process.env.PORT` here silently fell back to 3000, collided with a
 * neighbouring app, and left nginx pointing at a port nothing was listening on.
 * Reading the file is the only version that cannot drift.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Pulls one key out of .env. Returns null rather than guessing. */
function fromEnvFile(key) {
  try {
    const text = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\s]+)"?`, "m"));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const port = fromEnvFile("PORT") || process.env.PORT || "3000";
const instances = fromEnvFile("PM2_INSTANCES") || process.env.PM2_INSTANCES || "1";
const clustered = instances !== "1";

module.exports = {
  apps: [
    {
      name: "carvyapar",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,

      instances: clustered ? instances : 1,
      exec_mode: clustered ? "cluster" : "fork",

      // Next.js reads PORT too; keeping both in step avoids one of them winning
      // by accident after a config edit.
      env: { NODE_ENV: "production", PORT: port },

      // Restart on a memory leak rather than letting the box swap itself to death.
      max_memory_restart: "512M",

      // Give up if it crash-loops, instead of hammering the database.
      max_restarts: 10,
      min_uptime: "20s",

      error_file: "/var/log/carvyapar/error.log",
      out_file: "/var/log/carvyapar/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
