#!/usr/bin/env bash
#
# Updates a running CarVyapar deployment to the latest main.
#
#   cd /srv/carvyapar && git pull && sudo bash deploy/update.sh
#
# Applies schema changes, backfills any new role permissions, rebuilds, and
# reloads with zero downtime. It verifies the app is actually serving before
# it reports success, and leaves the previous build running if the new one
# fails to compile.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/carvyapar}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✖ %s\033[0m\n\n' "$*" >&2; exit 1; }

cd "${APP_DIR}" || die "No application at ${APP_DIR}"
[ -f .env ] || die ".env is missing. This is an update, not a first install."

PORT="$(grep '^PORT=' .env | cut -d'"' -f2)"
PORT="${PORT:-3000}"

say "Updating $(git rev-parse --short HEAD) → origin/main"
git fetch --quiet origin
BEFORE="$(git rev-parse HEAD)"
# The datasource is edited locally on every deploy, so drop that change before
# pulling rather than hitting a merge conflict on a one-line difference.
git checkout --quiet -- prisma/schema.prisma 2>/dev/null || true
git reset --hard --quiet origin/main
AFTER="$(git rev-parse HEAD)"

if [ "${BEFORE}" = "${AFTER}" ]; then
  ok "already on the latest commit"
else
  ok "$(git log --oneline "${BEFORE}..${AFTER}" | wc -l) new commit(s)"
fi

# SQLite is for local development; a web server needs Postgres.
if grep -q 'provider = "sqlite"' prisma/schema.prisma; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
  ok "datasource switched to postgresql"
fi

say "Dependencies"
npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
ok "installed"

say "Database"
set -a; . ./.env; set +a

# Prisma refuses a change it considers destructive. Rather than passing
# --accept-data-loss on every deploy, which would let a genuinely destructive
# change through unnoticed one day, show the warning and stop. Re-run with
# ACCEPT_DATA_LOSS=1 once you have read it and are content.
# stdin from /dev/null so Prisma never opens an interactive prompt: on a TTY it
# asks "ignore the warning?", answers no for us, and reports a cancelled push
# rather than the flag hint — which is not something a deploy script can read.
if npx prisma db push --skip-generate </dev/null >/tmp/carvyapar-db.log 2>&1; then
  ok "schema applied"
elif grep -qiE "might be data loss|accept-data-loss|Push cancelled" /tmp/carvyapar-db.log; then
  if [ "${ACCEPT_DATA_LOSS:-}" = "1" ]; then
    warn "proceeding past the data-loss warning because ACCEPT_DATA_LOSS=1"
    grep -A 4 "might be data loss" /tmp/carvyapar-db.log || true
    npx prisma db push --skip-generate --accept-data-loss </dev/null >/dev/null
    ok "schema applied"
  else
    echo
    grep -A 6 "might be data loss" /tmp/carvyapar-db.log || cat /tmp/carvyapar-db.log
    echo
    warn "The site is untouched and still serving the previous version."
    die "Read the warning above. If it is safe, re-run with: ACCEPT_DATA_LOSS=1 sudo -E bash deploy/update.sh"
  fi
else
  tail -20 /tmp/carvyapar-db.log
  die "Schema update failed. The previous version is still running."
fi

# The delivery-report webhook URL is built from this.
if ! grep -q '^APP_URL=' .env; then
  warn "APP_URL is not set in .env — the SMS delivery-report URL will render without a domain."
  warn "Add:  APP_URL=\"https://carvyapar.in\""
fi

npx prisma generate >/dev/null 2>&1 || true

# New permissions do not reach existing tenants on their own.
if [ -f scripts/backfill-permissions.mjs ]; then
  node scripts/backfill-permissions.mjs
fi

say "Building"
# Build before touching the running process: a compile error should leave the
# old version serving rather than take the site down.
if ! npm run build >/tmp/carvyapar-build.log 2>&1; then
  tail -30 /tmp/carvyapar-build.log
  die "Build failed. The previous version is still running, untouched."
fi
ok "built"

say "Reloading"
pm2 reload carvyapar --update-env >/dev/null
sleep 5

if curl -fsS --max-time 20 "http://127.0.0.1:${PORT}" 2>/dev/null | grep -qi 'carvyapar'; then
  ok "serving on port ${PORT}"
else
  pm2 logs carvyapar --lines 25 --nostream || true
  die "The app is not answering on ${PORT}. The log above says why."
fi

pm2 save >/dev/null 2>&1 || true

say "Done"
echo
git log --oneline -3 | sed 's/^/  /'
echo
echo "  Logs     pm2 logs carvyapar"
echo "  Status   pm2 list"
echo
