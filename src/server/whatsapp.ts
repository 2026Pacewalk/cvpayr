import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES, renderTemplate, type TemplateVars } from "@/lib/whatsapp";

/**
 * Template access for a dealership.
 *
 * The default set is seeded lazily the first time a dealer opens any WhatsApp
 * action, so existing accounts gain templates without a migration and new
 * accounts need no extra onboarding step.
 */
export async function getTemplates(dealerId: string, opts?: { includeInactive?: boolean }) {
  const existing = await db.whatsappTemplate.findMany({
    where: { dealerId, ...(opts?.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (existing.length > 0) return existing;

  // Nothing yet — seed this dealer's copy of the defaults.
  await db.whatsappTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({
      dealerId,
      key: t.key,
      name: t.name,
      category: t.category,
      body: t.body,
      sortOrder: t.sortOrder,
      isSystem: true,
    })),
  });

  return db.whatsappTemplate.findMany({
    where: { dealerId, ...(opts?.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getTemplate(dealerId: string, key: string) {
  const all = await getTemplates(dealerId);
  return all.find((t) => t.key === key) ?? null;
}

/**
 * Renders a named template for a dealership, falling back to the shipped
 * default if the dealer deactivated or deleted it.
 */
export async function renderFor(
  dealerId: string,
  key: string,
  vars: TemplateVars,
): Promise<string> {
  const template = await getTemplate(dealerId, key);
  const body = template?.body ?? DEFAULT_TEMPLATES.find((t) => t.key === key)?.body ?? "";
  return renderTemplate(body, vars);
}
