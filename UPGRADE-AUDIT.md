# Phase 1 — Audit & gap analysis

Reviewed the working codebase (134 source files, 25 Prisma models, 52 routes) against the 40-point brief. Nothing was rebuilt; this maps what exists, what is partial, and what is genuinely missing.

Legend: **✅ exists** · **🟡 partial** · **❌ missing**

| # | Requirement | State | Notes |
|---|---|---|---|
| 1 | WhatsApp-first CRM | 🟡 | wa.me links with pre-filled text exist on public pages + lead/follow-up rows. No reusable templates, no template manager, click tracking only on the public site. |
| 2 | Personalised shortlist | 🟡 | `SharedCatalog` + `/d/[slug]/c/[code]` + Quick Match builder all work. No requirement capture, no edit-after-send, open tracking is a raw counter only. |
| 3 | Customer requirements | ❌ | No model. `Lead.requirement` is a free-text string. |
| 4 | Automatic inventory matching | ❌ | Nothing. |
| 5 | Inventory ageing | 🟡 | `ageingReport()` + dashboard + `/reports/ageing` exist. Buckets are 5, brief asks for 6 (needs 31–45 / 46–60 split). |
| 6 | Inventory health score | ❌ | Nothing. |
| 7 | Full cost & profit | 🟡 | Only `purchasePrice` + single `refurbishmentCost`. No itemised cost heads. |
| 8 | Vehicle expense management | ❌ | No `VehicleExpense` model. |
| 9 | Price change history | ❌ | No model. Price edits are silently overwritten. |
| 10 | Inspection report | 🟡 | Flat condition fields on `Vehicle`. No sectioned inspection, no public/private control. |
| 11 | Document vault | ❌ | Only date fields (`insuranceValidTill` etc). No files, no visibility, no expiry reminders. |
| 12 | Branch transfer history | ✅ | `BranchTransfer` model + UI + audit already correct. |
| 13 | Booking / token | 🟡 | Model exists. Missing `receiptNumber`, `expiresAt`, expiry release. |
| 14 | Lost lead reasons | 🟡 | Free-text `lostReason` + a constants list. No coded reason, no analytics beyond a bar chart. |
| 15 | Lead response time / SLA | ❌ | No `firstResponseAt` / `firstContactAt`. No SLA widgets. |
| 16 | Smart lead assignment | 🟡 | Manual + round-robin (`autoAssignLead`) exist and are branch-aware. Not configurable, method not recorded. |
| 17 | Activity timeline | 🟡 | `LeadActivity` + timeline UI exist. Missing phone-click, whatsapp-click, shortlist-sent, vehicle-changed events. |
| 18 | Duplicate customer control | ✅ | `upsertCustomer` dedupes on normalised mobile; open-duplicate leads attach instead of forking. |
| 19 | Website customisation | 🟡 | Hero, SEO, section toggles, why-choose-us all editable. No colour/favicon/section reorder. |
| 20 | Vehicle QR code | 🟡 | QR renders on the public vehicle page. No download/print, none in the CRM. |
| 21 | Smart stock ID | 🟡 | Sequential `STK-0001`. Not branch/model aware, not configurable. |
| 22 | Bulk import | ❌ | Plan flag `bulkImport` exists; no implementation. |
| 23 | Vehicle duplicate detection | 🟡 | Registration-number check on create only. No chassis number, none on edit. |
| 24 | Mobile inventory creation | 🟡 | Form is responsive with a sticky action bar, but is one long page — not stepped, no draft resume, no camera capture hint. |
| 25 | Customer call screen | ❌ | No dedicated screen. Lead detail is close but desktop-shaped. |
| 26 | Source & conversion analytics | 🟡 | Source breakdown + conversion exist. No per-source revenue/booking table. |
| 27 | Owner daily dashboard | 🟡 | Strong already (alerts, charts, queues). Missing uncontacted-leads, booking-expiry and match widgets. |
| 28 | Sales exec dashboard | 🟡 | Same dashboard, scoped by permission. Not a distinct action-oriented layout. |
| 29 | Notification priorities | ❌ | No `priority` field. |
| 30 | Global search | ✅ | `/search` across vehicles, leads, customers, sales, permission-filtered. |
| 31 | Audit logs | ✅ | `AuditLog` + `/audit` + diff capture on vehicle updates. |
| 32 | Soft delete | ❌ | Hard `delete()` on vehicles, leads, roles, coupons. |
| 33 | PWA | ❌ | No manifest, no icons, no service worker. |
| 34 | Performance | 🟡 | Selective `select`, pagination, lazy images. `/inventory` does an N+1 for private cost per row. |
| 35 | Security | 🟡 | Tenant scoping + server-side permission gates + cost stripping verified earlier. Needs a written IDOR/API sweep. |
| 36 | Role permission testing | 🟡 | Verified by route sweep earlier. No repeatable harness. |
| 37 | End-to-end QA | 🟡 | Flows 1, 3, 4, 5 verified live earlier. Flow 2 impossible until requirements exist. |
| 38 | UI/UX review | 🟡 | Design system is consistent; mobile menus recently rebuilt. Ongoing. |

## Headline gaps

The product today is a strong **inventory + lead** system. What it is missing to become a daily-use dealership system is the **demand side**: there is nowhere to record what a customer wants, so there is nothing to match new stock against, and no reason for a salesperson to open the app when they have no live lead.

Priority order follows the brief's phases:

1. **Phase 2** — WhatsApp templates, richer timeline, lead SLA
2. **Phase 3** — Customer requirements + two-way inventory matching
3. **Phase 4** — Shortlists built from a requirement
4. **Phase 5** — Ageing buckets, health score, itemised cost/profit
5. **Phase 6** — Inspection, documents, booking expiry
6. **Phases 7–10** — Website customisation, QR/print, bulk import, analytics, security sweep, PWA, QA

## Migration approach

The project uses `prisma db push` against SQLite. All schema work below is **additive only** — new models and nullable/defaulted columns — so existing rows stay valid and no data is lost. No existing column is renamed, retyped or dropped.
