import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExternalLink, Globe } from "lucide-react";
import { requireDealerUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateWebsiteSettings } from "@/app/actions/org";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { WebsiteSettingsForm } from "@/components/crm/WebsiteSettingsForm";
import { safeJsonParse } from "@/lib/utils";
import type { WhyChooseUsItem } from "@/server/dealer";

export const metadata: Metadata = { title: "Website" };
export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const user = await requireDealerUser();
  if (!can(user, PERMISSIONS.WEBSITE_MANAGE)) redirect("/dashboard");

  const [dealer, counts] = await Promise.all([
    db.dealer.findUnique({
      where: { id: user.dealerId },
      include: { websiteSettings: true },
    }),
    Promise.all([
      db.vehicle.count({
        where: { dealerId: user.dealerId, status: { in: ["available", "reserved", "booked"] } },
      }),
      db.vehicle.aggregate({ where: { dealerId: user.dealerId }, _sum: { viewCount: true } }),
      db.lead.count({ where: { dealerId: user.dealerId, source: "website" } }),
    ]),
  ]);

  if (!dealer) redirect("/dashboard");
  const [liveCars, views, websiteLeads] = counts;
  const settings = dealer.websiteSettings;
  const publicUrl = `/d/${dealer.slug}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Public website"
        description="Everything a customer sees. Changes go live immediately."
        actions={
          <LinkButton href={publicUrl} target="_blank" variant="outline" size="sm">
            <ExternalLink className="size-4" />
            Open showroom
          </LinkButton>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
              <Globe className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-ink-950">Your showroom URL</h2>
                <Badge tone={settings?.isPublished !== false ? "success" : "warning"} size="sm" dot>
                  {settings?.isPublished !== false ? "Live" : "Unpublished"}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[12.5px] text-brand-700">{publicUrl}</p>
            </div>
          </div>
          <dl className="flex gap-6">
            {[
              { k: "Cars live", v: liveCars },
              { k: "Page views", v: views._sum.viewCount ?? 0 },
              { k: "Website leads", v: websiteLeads },
            ].map((s) => (
              <div key={s.k} className="text-center">
                <dd className="font-display text-[18px] font-semibold text-ink-950 tabular-nums">
                  {s.v}
                </dd>
                <dt className="mt-0.5 text-[11px] text-ink-400">{s.k}</dt>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-4 border-t border-ink-100 pt-4 text-[12.5px] leading-relaxed text-ink-500">
          A subdomain (<code className="text-ink-700">yourname.carvyapar.in</code>) and a fully
          custom domain are supported by the architecture and are unlocked on the Enterprise plan —
          contact the platform team to enable one for this account.
        </p>
      </Card>

      <WebsiteSettingsForm
        action={updateWebsiteSettings}
        values={{
          heroHeadline: settings?.heroHeadline ?? null,
          heroSubheadline: settings?.heroSubheadline ?? null,
          heroImageUrl: settings?.heroImageUrl ?? null,
          metaTitle: settings?.metaTitle ?? null,
          metaDescription: settings?.metaDescription ?? null,
          showFinance: settings?.showFinance ?? true,
          showSellYourCar: settings?.showSellYourCar ?? true,
          showTestimonials: settings?.showTestimonials ?? true,
          isPublished: settings?.isPublished ?? true,
          whyChooseUs: safeJsonParse<WhyChooseUsItem[]>(settings?.whyChooseUs, []),
          template: settings?.template ?? "momentum",
          themeAccent: settings?.themeAccent ?? null,
        }}
        previewBase={`/d/${user.dealerSlug}`}
      />
    </div>
  );
}
