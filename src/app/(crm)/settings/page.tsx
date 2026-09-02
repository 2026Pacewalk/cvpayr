import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CreditCard, Globe, ExternalLink, Check, Ticket, MessageCircle, Bell, AlarmClock, MessageSquare } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { resolvePlan, getUsage } from "@/lib/plan";
import { getActiveDiscount, resolveBilling } from "@/lib/coupons";
import { yearlyPrice, yearlySaving, yearlyMonthlyEquivalent, YEARLY_DISCOUNT_PERCENT } from "@/lib/billing";
import { updateDealerSettings } from "@/app/actions/org";
import { PageHeader, Card, CardHeader, Badge, ProgressBar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { DealerSettingsForm } from "@/components/crm/DealerSettingsForm";
import { formatPrice, formatDate, safeJsonParse, pct } from "@/lib/utils";
import type { WorkingHour } from "@/server/dealer";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.SETTINGS_VIEW)) redirect("/dashboard");

  const [dealer, plan, usage, plans, discount, billing] = await Promise.all([
    db.dealer.findUnique({ where: { id: user.dealerId } }),
    resolvePlan(user.dealerId),
    getUsage(user.dealerId),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getActiveDiscount(user.dealerId),
    resolveBilling(user.dealerId),
  ]);

  if (!dealer) redirect("/dashboard");

  const canManage = can(user, PERMISSIONS.SETTINGS_MANAGE);
  const hours = safeJsonParse<WorkingHour[]>(dealer.workingHours, []);

  const limits = [
    { label: "Branches", used: usage.branches, limit: plan.limits.maxBranches },
    { label: "Staff accounts", used: usage.users, limit: plan.limits.maxUsers },
    { label: "Vehicles in stock", used: usage.vehicles, limit: plan.limits.maxVehicles },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Dealership settings"
        description="Your business details, contact information and public identity."
        actions={
          user.dealerSlug ? (
            <LinkButton href={`/d/${user.dealerSlug}`} target="_blank" variant="outline" size="sm">
              <ExternalLink className="size-4" />
              View public site
            </LinkButton>
          ) : null
        }
      />

      {/* Plan & usage */}
      <Card className="mb-5">
        <CardHeader
          title="Your plan"
          description={`${plan.planName} · ${plan.status}`}
          icon={<CreditCard className="size-4" />}
          action={
            <Badge tone={plan.status === "active" ? "success" : plan.status === "trial" ? "info" : "warning"}>
              {plan.status}
            </Badge>
          }
        />

        {billing && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-ink-200 bg-ink-50 p-4">
            <div>
              <p className="field-label">Billing cycle</p>
              <p className="mt-1 text-[14px] font-semibold text-ink-900">
                {billing.cycle === "yearly" ? "Yearly" : "Monthly"}
                {billing.cycle === "yearly" && (
                  <span className="ml-2 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-700">
                    {YEARLY_DISCOUNT_PERCENT}% yearly discount applied
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="field-label">
                {billing.cycle === "yearly" ? "Billed per year" : "Billed per month"}
              </p>
              <p className="mt-1 font-display text-[18px] font-semibold text-ink-950 tabular-nums">
                {formatPrice(billing.payable)}
              </p>
              {billing.cycle === "monthly" && (
                <p className="mt-0.5 text-[11.5px] text-success-700">
                  Save {formatPrice(yearlySaving(billing.priceMonthly))} a year by paying yearly
                </p>
              )}
              {billing.cycle === "yearly" && (
                <p className="mt-0.5 text-[11.5px] text-ink-400">
                  Works out to {formatPrice(yearlyMonthlyEquivalent(billing.priceMonthly))} a month
                </p>
              )}
            </div>
          </div>
        )}

        {discount && (
          <div className="mt-4 rounded-[12px] border border-success-100 bg-success-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-white text-success-600">
                  <Ticket className="size-[18px]" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-success-800">
                      Discount applied
                    </p>
                    <span className="rounded-[6px] bg-ink-900 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-white">
                      {discount.code}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-success-800/80">{discount.description}</p>
                  {discount.expiresAt && (
                    <p className="mt-1 text-[11.5px] text-success-800/60">
                      Runs until {formatDate(discount.expiresAt)}, then the standard price resumes.
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-ink-400 line-through tabular-nums">
                  {formatPrice(discount.originalPrice)}
                </p>
                <p className="font-display text-[20px] leading-none font-semibold text-success-800 tabular-nums">
                  {formatPrice(discount.finalPrice)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {billing?.cycle === "yearly" ? "per year" : "per month"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {limits.map((l) => {
            const unlimited = l.limit < 0;
            const percentage = unlimited ? 0 : pct(l.used, l.limit);
            return (
              <div key={l.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="field-label">{l.label}</p>
                  <p className="text-[12px] text-ink-500 tabular-nums">
                    {l.used} / {unlimited ? "∞" : l.limit}
                  </p>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={unlimited ? 8 : percentage}
                    height="h-1.5"
                    tone={percentage >= 90 ? "danger" : percentage >= 70 ? "warning" : "brand"}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {plan.currentPeriodEnd && (
          <p className="mt-4 border-t border-ink-100 pt-4 text-[12.5px] text-ink-500">
            Current period ends {formatDate(plan.currentPeriodEnd)}.
          </p>
        )}
        {plan.trialEndsAt && (
          <p className="mt-4 border-t border-ink-100 pt-4 text-[12.5px] text-warning-700">
            Trial ends {formatDate(plan.trialEndsAt)}.
          </p>
        )}

        <div className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-3">
          {plans.map((p) => {
            const current = p.code === plan.planCode;
            const features = safeJsonParse<Record<string, boolean>>(p.features, {});
            return (
              <div
                key={p.id}
                className={
                  current
                    ? "rounded-[12px] border-2 border-brand-500 bg-brand-50/40 p-4"
                    : "rounded-[12px] border border-ink-200 p-4"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink-950">{p.name}</p>
                  {current && <Badge tone="brand" size="sm">Current</Badge>}
                </div>
                <p className="mt-1 font-display text-[18px] font-semibold text-ink-950">
                  {formatPrice(p.priceMonthly)}
                  <span className="text-[12px] font-normal text-ink-400"> /month</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-500">
                  or {formatPrice(yearlyPrice(p.priceMonthly))}/year
                  <span className="ml-1 text-success-700">(save {YEARLY_DISCOUNT_PERCENT}%)</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-[12px] text-ink-600">
                  <li>{p.maxBranches < 0 ? "Unlimited" : p.maxBranches} branches</li>
                  <li>{p.maxUsers < 0 ? "Unlimited" : p.maxUsers} staff accounts</li>
                  <li>{p.maxVehicles < 0 ? "Unlimited" : p.maxVehicles} vehicles</li>
                  {features.customDomain && (
                    <li className="flex items-center gap-1 text-success-700">
                      <Check className="size-3" /> Custom domain
                    </li>
                  )}
                  {features.advancedReports && (
                    <li className="flex items-center gap-1 text-success-700">
                      <Check className="size-3" /> Advanced reports
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-ink-400">
          Plan changes are handled by the platform team — contact support to upgrade.
        </p>
      </Card>

      {/* WhatsApp templates shortcut */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-[9px] bg-success-50 text-success-600">
              <MessageCircle className="size-[18px]" />
            </span>
            <div>
              <h3 className="text-[14.5px] font-semibold text-ink-900">WhatsApp templates</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                The messages your team sends for vehicle details, follow-ups, test drives and bookings.
              </p>
            </div>
          </div>
          <LinkButton href="/settings/templates" variant="outline" size="sm">
            Manage templates
          </LinkButton>
        </div>
      </Card>

      {/* Thresholds shortcut */}
      {can(user, PERMISSIONS.SETTINGS_MANAGE) && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-[9px] bg-warning-50 text-warning-600">
                <AlarmClock className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-[14.5px] font-semibold text-ink-900">
                  Response &amp; ageing thresholds
                </h3>
                <p className="mt-0.5 text-[12.5px] text-ink-500">
                  How fast you answer an enquiry, when stock counts as old, when a booking is
                  at risk. Drives the action centre and every scheduled alert.
                </p>
              </div>
            </div>
            <LinkButton href="/settings/thresholds" variant="outline" size="sm">
              Set thresholds
            </LinkButton>
          </div>
        </Card>
      )}

      {/* SMS shortcut */}
      {can(user, PERMISSIONS.SETTINGS_MANAGE) && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-[9px] bg-purple-50 text-purple-600">
                <MessageSquare className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-[14.5px] font-semibold text-ink-900">SMS</h3>
                <p className="mt-0.5 text-[12.5px] text-ink-500">
                  Your gateway account, DLT-approved templates, and a log of every message
                  attempted.
                </p>
              </div>
            </div>
            <LinkButton href="/settings/sms" variant="outline" size="sm">
              SMS settings
            </LinkButton>
          </div>
        </Card>
      )}

      {/* Notification preferences shortcut */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-[9px] bg-brand-50 text-brand-600">
              <Bell className="size-[18px]" />
            </span>
            <div>
              <h3 className="text-[14.5px] font-semibold text-ink-900">Your notifications</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                Which alerts reach you, browser notifications, quiet hours and your daily plan.
              </p>
            </div>
          </div>
          <LinkButton href="/settings/notifications" variant="outline" size="sm">
            Notification settings
          </LinkButton>
        </div>
      </Card>

      {/* Website shortcut */}
      {can(user, PERMISSIONS.WEBSITE_MANAGE) && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-[9px] bg-brand-50 text-brand-600">
                <Globe className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-[14.5px] font-semibold text-ink-900">Public website</h3>
                <p className="mt-0.5 text-[12.5px] text-ink-500">
                  Hero copy, SEO, and which sections appear on your showroom.
                </p>
              </div>
            </div>
            <LinkButton href="/website" variant="outline" size="sm">
              Manage website
            </LinkButton>
          </div>
        </Card>
      )}

      {canManage ? (
        <DealerSettingsForm
          action={updateDealerSettings}
          values={{
            name: dealer.name,
            legalName: dealer.legalName,
            tagline: dealer.tagline,
            about: dealer.about,
            contactPerson: dealer.contactPerson,
            phone: dealer.phone,
            whatsapp: dealer.whatsapp,
            email: dealer.email,
            website: dealer.website,
            addressLine: dealer.addressLine,
            city: dealer.city,
            state: dealer.state,
            pincode: dealer.pincode,
            mapsUrl: dealer.mapsUrl,
            gstin: dealer.gstin,
            panNumber: dealer.panNumber,
            facebookUrl: dealer.facebookUrl,
            instagramUrl: dealer.instagramUrl,
            youtubeUrl: dealer.youtubeUrl,
            linkedinUrl: dealer.linkedinUrl,
            logoUrl: dealer.logoUrl,
            coverUrl: dealer.coverUrl,
            workingHours: hours,
          }}
        />
      ) : (
        <Card>
          <CardHeader title="Dealership profile" icon={<Building2 className="size-4" />} />
          <dl className="mt-4 space-y-3 text-[13px]">
            {[
              { k: "Name", v: dealer.name },
              { k: "Legal name", v: dealer.legalName },
              { k: "Contact person", v: dealer.contactPerson },
              { k: "Phone", v: dealer.phone },
              { k: "Email", v: dealer.email },
              { k: "Address", v: [dealer.addressLine, dealer.city, dealer.state].filter(Boolean).join(", ") },
              { k: "GSTIN", v: dealer.gstin },
              { k: "Public URL", v: `/d/${dealer.slug}` },
            ]
              .filter((r) => r.v)
              .map((r) => (
                <div key={r.k} className="flex justify-between gap-4 border-b border-ink-100 pb-3 last:border-0">
                  <dt className="shrink-0 text-ink-500">{r.k}</dt>
                  <dd className="text-right font-medium text-ink-900">{r.v}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 text-[12.5px] text-ink-400">
            You have view-only access to these settings.
          </p>
        </Card>
      )}
    </div>
  );
}
