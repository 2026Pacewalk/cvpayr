/**
 * PM2 process definition.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * `cluster` mode runs one Node process per CPU behind PM2's load balancer, so a
 * single slow request cannot block the whole site. The app holds no in-process
 * state that would break across workers — sessions are signed cookies and
 * everything else is in Postgres.
 */
module.exports = {
  apps: [
    {
      name: "carvyapar",
      cwd: "/srv/carvyapar",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: "max",
      exec_mode: "cluster",
      env: { NODE_ENV: "production", PORT: "3000" },

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
