/**
 * PM2 process definition.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * The port comes from PORT in .env, because a server rarely has only one app on
 * it. Hardcoding 3000 and hoping is how you end up serving somebody else's site
 * on your domain.
 *
 * Fork mode with a single instance by default: most VPSes run several apps, and
 * one process per CPU per app oversubscribes the box. On a dedicated machine set
 * PM2_INSTANCES=max in .env for one worker per core — the app holds no
 * in-process state, so it clusters safely.
 */
const port = process.env.PORT || "3000";
const instances = process.env.PM2_INSTANCES || 1;

module.exports = {
  apps: [
    {
      name: "carvyapar",
      cwd: "/srv/carvyapar",
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,

      instances,
      exec_mode: instances === 1 || instances === "1" ? "fork" : "cluster",

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
