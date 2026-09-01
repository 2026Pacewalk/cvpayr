#!/usr/bin/env bash
#
# One-command production deploy for CarVyapar.in on a fresh Ubuntu VPS.
#
#   sudo bash bootstrap.sh
#
# Installs Node, Postgres, nginx and PM2; creates the database; builds and
# starts the app; configures the reverse proxy, TLS and the reminder cron.
#
# Safe to re-run: it skips anything already done rather than clobbering it.
# It never seeds demo data and never deletes a database.

set -euo pipefail

DOMAIN="${DOMAIN:-carvyapar.in}"
REPO="${REPO:-https://github.com/2026Pacewalk/cvpayr.git}"
APP_DIR="${APP_DIR:-/srv/carvyapar}"
APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-carvyapar}"
DB_USER="${DB_USER:-carvyapar}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✖ %s\033[0m\n\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this with sudo."

# ---------------------------------------------------------------- 0. DNS

say "Checking DNS"
SERVER_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null \
  || curl -fsS --max-time 10 ifconfig.me 2>/dev/null || echo unknown)"

# Ask a public resolver directly. /etc/hosts entries and local DNS caches
# routinely make a domain look correct here when the outside world disagrees,
# and certbot only cares about the outside world.
DOMAIN_IP="$(dig +short @1.1.1.1 "$DOMAIN" A 2>/dev/null | tail -1)"
[ -n "${DOMAIN_IP:-}" ] || DOMAIN_IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"

echo "  this server : ${SERVER_IP}"
echo "  ${DOMAIN} : ${DOMAIN_IP:-not resolving}"

DNS_OK=false
if [ -n "${DOMAIN_IP:-}" ] && [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
  DNS_OK=true
  ok "Domain points here — TLS will be issued at the end."
else
  warn "Domain does not resolve to this server yet."
  warn "Everything else will still be set up; TLS is skipped."
  warn "Once DNS propagates, run:  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

# --------------------------------------------------------------- 0b. Port

# A server rarely hosts one app. Binding blind is how nginx ends up pointing
# your domain at somebody else's site, so take a port nothing else holds.
port_taken() { ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1$"; }

say "Choosing a port"
if port_taken "${APP_PORT}"; then
  ORIGINAL_PORT="${APP_PORT}"
  APP_PORT=""
  for candidate in $(seq 3200 3260); do
    if ! port_taken "${candidate}"; then APP_PORT="${candidate}"; break; fi
  done
  [ -n "${APP_PORT}" ] || die "No free port between 3200 and 3260."
  warn "Port ${ORIGINAL_PORT} is already in use — using ${APP_PORT} instead."
else
  ok "port ${APP_PORT} is free"
fi

# ------------------------------------------------------------ 1. Packages

say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg nginx postgresql \
  certbot python3-certbot-nginx openssl cron dnsutils >/dev/null
systemctl enable --now cron >/dev/null 2>&1 || true
ok "base packages"

if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
ok "node $(node -v)"

command -v pm2 >/dev/null || npm install -g pm2 >/dev/null 2>&1
ok "pm2 $(pm2 -v)"

systemctl enable --now postgresql >/dev/null 2>&1 || true

# ------------------------------------------------------------ 2. Database

say "Database"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "database '${DB_NAME}' already exists — leaving its data alone"
  # The password lives in the existing .env; do not rotate it underneath a
  # running app.
  DB_PASS=""
else
  DB_PASS="$(openssl rand -base64 30 | tr -d '/+=' | head -c 32)"
  sudo -u postgres psql -q <<SQL
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL
  ok "database '${DB_NAME}' and user '${DB_USER}' created"
fi

# --------------------------------------------------------------- 3. Code

say "Application code"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" fetch --quiet origin
  git -C "${APP_DIR}" reset --hard --quiet origin/main
  ok "updated to latest main"
else
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone --quiet "${REPO}" "${APP_DIR}"
  ok "cloned into ${APP_DIR}"
fi
cd "${APP_DIR}"

# Postgres, not SQLite. SQLite locks under concurrent web traffic.
if grep -q 'provider = "sqlite"' prisma/schema.prisma; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
  ok "Prisma datasource switched to postgresql"
else
  ok "Prisma datasource already postgresql"
fi

# ------------------------------------------------------------ 4. Env file

say "Environment"
if [ -f .env ]; then
  ok ".env already exists — keeping your secrets"
  # Keep the port in .env authoritative, so a re-run on a busy server does
  # not leave PM2 and nginx disagreeing about where the app lives.
  if grep -q '^PORT=' .env; then
    sed -i "s|^PORT=.*|PORT=\"${APP_PORT}\"|" .env
  else
    echo "PORT=\"${APP_PORT}\"" >> .env
  fi
else
  [ -n "${DB_PASS}" ] || die ".env is missing but the database already exists. Restore .env, or drop the database and re-run."
  cat > .env <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
AUTH_SECRET="$(openssl rand -base64 48)"
CRON_SECRET="$(openssl rand -hex 32)"
NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
APP_URL="https://${DOMAIN}"
DISABLE_REMINDER_FALLBACK="1"
PORT="${APP_PORT}"
ENV
  ok ".env written with freshly generated secrets"
fi
chmod 600 .env
chown root:root .env

# --------------------------------------------------------------- 5. Build

say "Installing dependencies and building"
npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
ok "dependencies"

set -a; . ./.env; set +a
npx prisma db push --skip-generate >/dev/null
ok "database schema applied"

npm run build >/dev/null
ok "production build"

mkdir -p public/uploads /var/log/carvyapar
chmod 755 public/uploads

# ----------------------------------------------------------- 6. Run it

say "Starting the app"
pm2 delete carvyapar >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --update-env >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
sleep 4

if curl -fsS --max-time 15 "http://127.0.0.1:${APP_PORT}" 2>/dev/null | grep -qi 'carvyapar'; then
  ok "CarVyapar responding on port ${APP_PORT}"
else
  pm2 logs carvyapar --lines 30 --nostream || true
  die "CarVyapar is not answering on ${APP_PORT}. The log above says why."
fi

# ---------------------------------------------------------------- 7. Nginx

say "Reverse proxy"
sed "s/carvyapar\.in/${DOMAIN}/g; s/127\.0\.0\.1:3000/127.0.0.1:${APP_PORT}/g" \
  deploy/nginx.conf.example > /etc/nginx/sites-available/carvyapar
ln -sf /etc/nginx/sites-available/carvyapar /etc/nginx/sites-enabled/carvyapar
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || die "nginx config rejected. Run 'nginx -t' to see why."
systemctl reload nginx
ok "nginx serving ${DOMAIN}"

# ------------------------------------------------------------------ 8. TLS

if [ "$DNS_OK" = true ]; then
  say "TLS certificate"
  if certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
       --non-interactive --agree-tos --register-unsafely-without-email \
       --redirect >/dev/null 2>&1; then
    ok "https://${DOMAIN} secured, auto-renewal installed"
  else
    warn "Certbot failed. Run it by hand to see the reason:"
    warn "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
  fi
fi

# ----------------------------------------------------------------- 9. Cron

say "Scheduled reminders"

# Everything below is best-effort. A missing cron daemon must not abort a
# deploy that has already put a working site on the internet.
set +e

CRON_SECRET_VALUE="$(grep '^CRON_SECRET=' .env | cut -d'"' -f2)"
CRON_LINE="*/10 * * * * curl -fsS -X POST http://127.0.0.1:${APP_PORT}/api/cron/reminders -H 'x-cron-secret: ${CRON_SECRET_VALUE}' >/dev/null 2>&1"

if ! command -v crontab >/dev/null 2>&1; then
  warn "No crontab on this system. Reminders will not fire on a schedule."
  warn "Fix with:  apt-get install -y cron && systemctl enable --now cron"
elif crontab -l 2>/dev/null | grep -q "api/cron/reminders"; then
  ok "cron entry already present"
elif ( crontab -l 2>/dev/null; echo "${CRON_LINE}" ) | crontab - 2>/dev/null; then
  ok "reminders will run every 10 minutes"
else
  warn "Could not write the crontab. Add this line by hand with 'crontab -e':"
  echo "    ${CRON_LINE}"
fi

if curl -fsS -X POST "http://127.0.0.1:${APP_PORT}/api/cron/reminders" \
     -H "x-cron-secret: ${CRON_SECRET_VALUE}" 2>/dev/null | grep -q '"ok"'; then
  ok "reminder endpoint verified"
else
  warn "Reminder endpoint did not respond as expected — check it by hand."
fi

set -e

# -------------------------------------------------------------- 10. Admin

say "Done"
HAS_USER="$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT count(*) FROM users" 2>/dev/null || echo 0)"

echo
if [ "${HAS_USER}" = "0" ]; then
  echo "  The database is empty, so there is nothing to log in with yet."
  echo "  Create your platform login now:"
  echo
  echo "    cd ${APP_DIR}"
  echo '    node scripts/init-platform.mjs --email you@carvyapar.in --name "Your Name"'
  echo
  echo "  It prints a generated password once. Then sign in and create your"
  echo "  first dealership at /admin/dealers."
else
  echo "  ${HAS_USER} user(s) already exist — sign in at https://${DOMAIN}/login"
fi
echo
if [ "$DNS_OK" != true ]; then
  echo "  ! The site is on http:// only — TLS was skipped because ${DOMAIN}"
  echo "    did not resolve to ${SERVER_IP} when this ran."
  echo "    Once DNS is correct:  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
  echo
fi
echo "  Logs      pm2 logs carvyapar"
echo "  Restart   pm2 reload carvyapar"
echo "  Update    cd ${APP_DIR} && git pull && npm ci && npm run build && pm2 reload carvyapar"
echo
