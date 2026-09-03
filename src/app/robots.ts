import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Everything behind a login, plus the two public pages that hold no crawlable
 * content of their own.
 *
 * Inventory filters, shortlists, comparisons and share links are deliberately
 * absent: each carries its own meta robots noindex. A Disallow here would stop
 * a crawler ever reading that tag, which leaves the URL indexed with no
 * description rather than removed.
 */
const PRIVATE = [
  "/api/",
  "/admin",
  "/login",
  // The CRM. Each of these is a route group at the root, not under a prefix.
  "/attention",
  "/audit",
  "/branches",
  "/customers",
  "/dashboard",
  "/followups",
  "/inventory",
  "/leads",
  "/notifications",
  "/quick-search",
  "/reports",
  "/requirements",
  "/roles",
  "/sales",
  "/search",
  "/service",
  "/settings",
  "/staff",
  "/test-drives",
  "/website",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // Assistants that cite sources send buyers to dealer showrooms, so they
      // get the same access as a search crawler rather than a blanket block.
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
