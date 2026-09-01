# CarVyapar.in

A multi-tenant platform for used-car dealerships. Every dealer gets a **public digital showroom**, a **multi-branch inventory system**, and a **sales CRM** — all from one account.

---

## Quick start

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` generates the Prisma client, creates the SQLite database and seeds a full demo dealership. Then open <http://localhost:3000>.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run setup` | Generate client + create DB + seed |
| `npm run db:reset` | Wipe and re-seed the demo data |
| `npm run db:seed` | Seed only |

---

## Demo accounts

Password for every account is `password123`. Signing in as different roles is the fastest way to see the permission model working.

| Role | Email | What changes |
| --- | --- | --- |
| Dealer Owner | `owner@sharmaautowheels.in` | Everything, including cost and margin |
| Branch Manager | `vikram@sharmaautowheels.in` | Ludhiana branch only, sees cost |
| Sales Executive | `priya@sharmaautowheels.in` | Only leads assigned to them, no cost or margin |
| Inventory Manager | `harpreet@sharmaautowheels.in` | Stock and pricing, no CRM |
| Lead Manager | `neha@sharmaautowheels.in` | Full pipeline, can assign leads |
| View Only | `ravi@sharmaautowheels.in` | Read-only, no cost visibility |
| Super Admin | `admin@carvyapar.in` | Platform console across all tenants |

**Public showroom:** <http://localhost:3000/d/sharma-auto>
**Second tenant** (proves isolation): <http://localhost:3000/d/kohli-motors>

---

## The workflow this is built around

```
Dealer adds a vehicle
  → it publishes to the public website
  → customer searches, filters and opens the car
  → customer sends an enquiry (or taps WhatsApp)
  → a lead is created automatically with vehicle, branch, source and UTM attached
  → lead is assigned (manually, by branch, or round-robin)
  → follow-up → test drive → negotiation → booking
  → vehicle flips to Booked
  → sale completed → vehicle flips to Sold and is archived
  → the sale appears in reports with a snapshot of cost and margin
```

Every step is live in the app. Closing a sale also auto-closes competing open leads on the same car with the reason *Vehicle sold*.

---

## Architecture

### Stack

- **Next.js 15** (App Router, Server Components, Server Actions)
- **TypeScript**, strict
- **Tailwind CSS v4** with a token-driven design system
- **Prisma + SQLite** — the schema is written to be Postgres-portable; switching is a one-line `provider` change
- **Recharts** for data visualisation, **lucide-react** for icons
- Session auth via signed JWT in an httpOnly cookie (`jose` + `bcryptjs`)

### Directory map

```
src/
  app/
    page.tsx                 platform landing page
    login/                   authentication
    d/[slug]/                PUBLIC dealer showroom
      cars/[vehicleSlug]/    vehicle detail (SEO slug + JSON-LD)
      c/[code]/              shared shortlist link
    (crm)/                   DEALER CRM  (route group → /dashboard, /inventory, …)
    admin/                   SUPER ADMIN platform console
    actions/                 server actions, grouped by domain
    api/upload/              image upload
    api/export/[entity]/     CSV export (permission-filtered)
    api/notifications/       bell polling (unread + what is new)
    api/cron/reminders/      scheduled reminder trigger (secret-protected)
  components/
    ui/                      design system primitives
    public/                  showroom components
    crm/                     dealer console components
    admin/                   platform console components
  lib/
    constants.ts             every enum, label and badge tone
    permissions.ts           RBAC catalogue + role templates
    rbac.ts                  can() / branch scoping / cost + margin gates
    plan.ts                  centralised plan limits and feature flags
    coupons.ts               subscription discounts + net MRR
    notifications.ts         notification catalogue: types, priority, routing
    attention.ts             action catalogue: what counts as unresolved work
    channels.ts              email / WhatsApp transports (no-op until configured)
    auth.ts                  session, tenant boundary
  server/                    tenant-scoped data access
    notifications.ts         notification engine (write, route, read, dedupe)
    reminders.ts             scheduled sweep: SLA, follow-ups, ageing, documents
    attention.ts             action centre engine + "start my day" queue
scripts/
  run-reminders.mjs          cron entry point for the reminder sweep
prisma/
  schema.prisma              full data model
  seed.ts                    demo dealership + second tenant
```

### Notifications vs the action centre

Two systems, deliberately kept apart, because they answer different questions:

| | Notification centre | Needs your attention |
|---|---|---|
| Answers | *What happened?* | *What do I still have to do?* |
| Storage | Rows in `notifications`, written once | Nothing — computed from live state on every load |
| Clears when | You read it | The underlying work is actually done |
| Example | "New enquiry from Rahul Sharma" | "Rahul's enquiry is 40 minutes old and nobody has replied" |

An action disappears the moment a lead is contacted, a follow-up is completed or
a car is sold. There is no queue to drain and no stale row to clean up, which is
why the counts can be trusted.

Notifications are deduplicated by `Notification.dedupeKey` (unique per dealer),
so the sweep can run every ten minutes and still produce one alert per event.

### Scheduled reminders

`src/server/reminders.ts` runs on the server, so reminders keep firing when
nobody has the CRM open. Point any scheduler at the route every ten minutes:

```bash
curl -X POST https://your-domain/api/cron/reminders -H "x-cron-secret: $CRON_SECRET"
```

or run `node scripts/run-reminders.mjs`. Without a scheduler the app also sweeps
opportunistically whenever someone uses the CRM, at most once every ten minutes;
set `DISABLE_REMINDER_FALLBACK=1` once real cron is in place.

Jobs: response-time SLA and escalation, due and overdue follow-ups, unowned and
stale leads, test drives today/tomorrow and missing feedback, inventory ageing,
document expiry, bookings at risk, a per-person daily plan, subscription health
for platform staff, and the retention purge.

### Operating thresholds

`CrmSettings` holds one row per dealership: the response promise, the ageing
marks, when a lead goes cold, when a booking is at risk. The action centre, the
dashboard response queue and the scheduled reminder engine all read from it, so
nothing is hardcoded and the three can never disagree. Edited at
**Settings -> Response & ageing thresholds**.

### Multi-tenancy

`dealerId` is the tenant boundary. It comes from the session — never from user input — and every query in `src/server/*` and every server action is scoped by it. A second dealership (*Kohli Motors*) is seeded specifically so tenant isolation is visible rather than asserted.

### Permissions

There are two independent layers:

- **Roles** decide *what* someone can do. Every guarded capability has one key in `src/lib/permissions.ts`; roles hold a JSON array of them and a Dealer Owner can create custom roles from the Roles & Access screen.
- **Branch access** decides *which records* they see. No branch rows = all branches.

Commercially sensitive fields (`purchasePrice`, `minAcceptablePrice`, `refurbishmentCost`, `internalNotes`, gross profit) are gated behind `inventory.view_cost` and `inventory.view_margin`. They are stripped **server-side** before data reaches a client component, and the CSV export applies the same rules — so a Sales Executive cannot see margin on screen, in an export, or in a network response.

### Plan limits

No limit is hardcoded in feature code. Every guarded action calls `checkLimit(dealerId, kind)`, which resolves against the dealer's plan row. Changing a plan in the Super Admin console immediately changes what those dealers can do.

### Billing cycles

Plans carry a **monthly** price. Choosing **yearly** applies a flat **10% discount automatically** — the yearly figure is always derived from the monthly one (`src/lib/billing.ts`), never typed in, so the two can never drift apart. The plan editor shows the calculated yearly price read-only, the public pricing page has a monthly/yearly toggle, and a dealer can be switched between cycles from their page in the admin console. MRR treats a yearly subscription as one twelfth of its annual price so monthly and yearly accounts can be added together honestly.

### Subscription coupons

Platform-issued codes that discount what a dealership pays. Managed at **/admin/coupons**, applied from any dealer's page under *Account controls → Subscription discount*.

- **Percent or flat**, optionally restricted to one plan, with a redemption cap and a code expiry date.
- **Priced against the actual invoice** — a 25% coupon on a yearly plan discounts the yearly amount, not the monthly one. Switching cycle retires the coupon rather than silently discounting the wrong figure.
- **Duration** — a 3-month coupon stops applying after 3 months. Expiry is evaluated whenever billing is read (`getActiveDiscount`), so no scheduled job is required.
- **One active discount per dealership.** A second application is rejected with a reason rather than silently stacking.
- **Prices are snapshotted** on the redemption, so raising a plan price later never rewrites what a dealer was charged.
- **Pausing is safe** — deactivating a code blocks new redemptions but leaves existing discounts running. Codes that have been redeemed cannot be deleted, only paused, so billing history stays intact.
- MRR everywhere in the admin console is **net of active discounts** (`platformMrr`), and the dealer sees the discount on their own Settings screen.

All pricing maths lives in `src/lib/coupons.ts` so the admin console, the dealer's billing card and the MRR figures can never disagree. Seeded demo codes: `LAUNCH50`, `DIWALI25`, `REFER1000`, `WINBACK40` (paused).

---

## What's included

**Public showroom** — homepage with hero search, featured and recent stock, brand/budget/body-type browsing, branch list, testimonials · full inventory with advanced filters (desktop sidebar, mobile bottom sheet) · vehicle detail with gallery + lightbox, condition report, features, EMI calculator, QR code, similar cars, sticky mobile CTAs · branches, about, contact, finance, sell-your-car · shortlist, compare (up to 4), recently viewed · shared shortlist pages.

**Dealer CRM** — dashboard led by *Needs your attention*, plus charts and work queues · action centre with priority grouping, branch filter, snooze/hide and one-tap fixes · *Start my day* guided queue that works one customer at a time with Save & next · notification centre with live bell, filters, quick actions and per-user preferences (sound, browser alerts, quiet hours, daily plan) · inventory with table/card views, bulk status updates, branch transfer, clone, ageing · full vehicle form with drag-to-reorder photo upload · leads as both table and drag-and-drop kanban · lead detail with stage stepper, activity timeline, notes, follow-ups, test drives, booking and sale · customers with deduplication by mobile number · follow-ups and test drives · bookings and sales · Quick Match (search stock while on a call, shortlist, send one link) · branches, staff, roles & permissions · reports incl. inventory ageing · notifications, activity log, global search, dealership and website settings.

**Super Admin** — platform overview with net MRR, dealer directory, dealer detail with status/plan/discount controls, dealer onboarding, plan editor, subscription coupons, platform analytics, settings.

---

## Deliberate scope notes

- **Images** — uploads are written to `public/uploads/<dealerId>/`. Swapping to S3 or Cloudinary means changing `src/app/api/upload/route.ts` and nothing else. Demo photography is loaded from Unsplash; `VehicleImage` falls back to a placeholder if a remote image fails.
- **Notifications** — in-app and browser alerts are live. Email and WhatsApp route through `src/lib/channels.ts`; both check for real credentials first, and the settings screen shows them as *Not connected* until a provider is configured. Nothing anywhere claims a message was sent that was not.
- **WhatsApp** — the Business API needs an approved account and approved templates. Until those exist the app uses `wa.me` deep links, which genuinely work today and open the dealer's own WhatsApp with the message pre-filled.
- **Export** — CSV is implemented for inventory, leads, sales and customers. The same row-builder shape is what an XLSX or PDF writer would consume.
- **Custom domains** — the `Dealer.customDomain` field and slug routing exist; enabling subdomains or custom domains is a hosting/DNS change, not a schema change.
- **Design reference** — the Pinterest link supplied is behind a login wall and could not be read, so the visual direction was set independently: a cool-neutral ink scale, one cobalt accent, restrained elevation and generous spacing.

---

## Deploying

1. Set `provider = "postgresql"` in `prisma/schema.prisma`.
2. Set `DATABASE_URL`, a strong `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL`.
3. `npx prisma migrate deploy` then `npm run build`.
4. Point uploads at object storage before serving real traffic.
5. Set `CRON_SECRET` and schedule `POST /api/cron/reminders` every ten minutes.
6. Optionally set `EMAIL_API_KEY` / `EMAIL_FROM` and the `WHATSAPP_*` variables to
   switch those delivery channels on. See `.env.example`.
