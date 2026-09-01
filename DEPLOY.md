# Deploying CarVyapar.in

A runbook for putting this on a Linux VPS with **carvyapar.in** pointed at it.
Ubuntu 22.04/24.04 assumed; adapt package names for other distributions.

The app is a standard Next.js server — it needs Node running behind a reverse
proxy, a Postgres database, and a cron entry for the reminder engine. There is
nothing exotic to configure.

---

## The short version

On a fresh Ubuntu server, this does everything below in one go:

```bash
curl -fsSL https://raw.githubusercontent.com/2026Pacewalk/cvpayr/main/deploy/bootstrap.sh | sudo bash
```

Then create your login:

```bash
cd /srv/carvyapar
node scripts/init-platform.mjs --email you@carvyapar.in --name "Your Name"
```

It prints a generated password once. Sign in at `https://carvyapar.in/login`,
change it, then create your first dealership at **/admin/dealers**.

The script is safe to re-run — it skips whatever is already done, never seeds
demo data, and never drops a database. If you would rather understand each
step, or something failed, work through the rest of this document by hand.

---

## 0. Before you start

Check the domain actually resolves to the server:

```bash
dig +short carvyapar.in
dig +short www.carvyapar.in
```

Both should return your server's public IP. If they don't, fix DNS first — an
`A` record for `@` and either an `A` or a `CNAME` for `www`. TLS issuance in
step 6 will fail otherwise.

---

## 1. Server packages

```bash
sudo apt update && sudo apt install -y curl git nginx postgresql certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

## 2. Database

SQLite is fine for local development and useless under a real web server, which
runs many requests at once. Create a Postgres database:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER carvyapar WITH PASSWORD 'CHANGE_THIS_TO_SOMETHING_LONG';
CREATE DATABASE carvyapar OWNER carvyapar;
SQL
```

Then switch the Prisma datasource in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Nothing else in the schema needs to change — it was written to be portable, with
no SQLite-only types or attributes.

---

## 3. Application

```bash
sudo mkdir -p /srv && cd /srv
sudo git clone https://github.com/2026Pacewalk/cvpayr.git carvyapar
sudo chown -R $USER:$USER /srv/carvyapar
cd /srv/carvyapar
npm ci
```

Create `/srv/carvyapar/.env`:

```bash
DATABASE_URL="postgresql://carvyapar:CHANGE_THIS_TO_SOMETHING_LONG@localhost:5432/carvyapar"

# Signs the session cookie. Generate with: openssl rand -base64 48
# Changing this later signs every user out.
AUTH_SECRET="PASTE_A_LONG_RANDOM_STRING"

NEXT_PUBLIC_APP_URL="https://carvyapar.in"
APP_URL="https://carvyapar.in"

# Protects /api/cron/reminders. Generate with: openssl rand -hex 32
CRON_SECRET="PASTE_ANOTHER_LONG_RANDOM_STRING"

# Real cron is configured in step 5, so the in-app fallback is not needed.
DISABLE_REMINDER_FALLBACK="1"
```

Lock it down — it holds the session signing key:

```bash
chmod 600 /srv/carvyapar/.env
```

Create the schema and build:

```bash
npx prisma db push        # first deploy only; use `prisma migrate deploy` once you adopt migrations
npm run build
```

**Seeding is optional and destructive.** `npm run db:seed` wipes the database and
inserts the demo dealership. Run it only on a fresh install you are happy to
lose, and never on live data.

---

## 4. Run it

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # then run the command it prints, so it survives a reboot
```

Check it is up:

```bash
curl -I http://127.0.0.1:3000
pm2 logs carvyapar --lines 50
```

A systemd unit is provided at `deploy/carvyapar.service` if you would rather not
use PM2.

---

## 5. Scheduled reminders

The reminder engine must run on the server, otherwise alerts only fire while
somebody happens to have the CRM open. Every ten minutes is a good interval, and
overlapping runs are safe because every notification is deduplicated.

```bash
crontab -e
```

```cron
*/10 * * * * curl -fsS -X POST https://carvyapar.in/api/cron/reminders -H "x-cron-secret: YOUR_CRON_SECRET" >/dev/null 2>&1
```

Verify it works before trusting it:

```bash
curl -fsS -X POST https://carvyapar.in/api/cron/reminders \
  -H "x-cron-secret: YOUR_CRON_SECRET" | head -c 400
```

You should get JSON with `"ok": true` and a `jobs` array.

---

## 6. Nginx and TLS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/carvyapar
sudo ln -sf /etc/nginx/sites-available/carvyapar /etc/nginx/sites-enabled/carvyapar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d carvyapar.in -d www.carvyapar.in
```

Certbot edits the server block in place to add the certificate and the HTTP
redirect, and installs a renewal timer.

---

## 7. Create your platform login

A fresh database has no users, so there is nothing to sign in with. This creates
the three subscription plans and your super admin, and nothing else:

```bash
cd /srv/carvyapar
node scripts/init-platform.mjs --email you@carvyapar.in --name "Your Name"
```

It prints a generated password **once**. Copy it, sign in, change it.

Then:

1. Sign in at `https://carvyapar.in/login`.
2. Go to **/admin/dealers** → *Add dealership*.
3. Set the slug — it becomes the public showroom URL, `carvyapar.in/d/<slug>`.

The script is safe to re-run; it leaves existing plans and users alone unless
you pass `--force` to reset a password.

Do not run `npm run db:seed` on this server. It wipes the database and inserts
the demo dealership, whose every password is `password123`.

---

## 8. Uploads

Photos are written to `public/uploads/<dealerId>/` on the server's disk. That
works, but it does not survive a rebuild on an ephemeral host and does not scale
to more than one machine. Before serving real traffic, point
`src/app/api/upload/route.ts` at S3, Cloudflare R2 or similar — it is the only
file that needs to change.

Make sure the directory exists and is writable:

```bash
mkdir -p /srv/carvyapar/public/uploads && chmod 755 /srv/carvyapar/public/uploads
```

---

## 9. Backups

The database is the business. Nightly dump:

```cron
30 2 * * * pg_dump -U carvyapar carvyapar | gzip > /var/backups/carvyapar-$(date +\%F).sql.gz
```

Keep them somewhere other than this server, and test a restore once.

---

## Updating later

```bash
cd /srv/carvyapar
git pull
npm ci
npx prisma migrate deploy     # or `prisma db push` if you are not using migrations
npm run build
pm2 reload carvyapar
```

`pm2 reload` restarts with zero downtime.

---

## Optional: email and WhatsApp

Both are off until credentials exist, and the app says so plainly rather than
pretending a message was sent. To switch them on, add to `.env` and rebuild:

```bash
EMAIL_API_KEY="..."          # Resend by default; see src/lib/channels.ts
EMAIL_FROM="alerts@carvyapar.in"

WHATSAPP_ACCESS_TOKEN="..."  # Meta Cloud API
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_API_VERSION="v21.0"
WHATSAPP_ALERT_TEMPLATE="..." # name of an approved template
```

WhatsApp needs an approved Business account and approved message templates.
Until then the app uses `wa.me` deep links, which work today and open the
dealer's own WhatsApp with the message pre-filled.

---

## If something is wrong

| Symptom | Look at |
|---|---|
| 502 from nginx | `pm2 logs carvyapar` — the app is not listening on 3000 |
| Signed out constantly | `AUTH_SECRET` changed, or differs between processes |
| Reminders never fire | Run the curl in step 5 by hand; check `CRON_SECRET` matches |
| Reminders fire but nothing appears | Normal — everything is deduplicated. Check `reminder_runs` |
| Images 404 | `public/uploads` missing or not writable |
| Build fails on Prisma | `npx prisma generate` then rebuild |
