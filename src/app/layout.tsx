import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { JsonLd } from "@/components/JsonLd";
import {
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
  organizationSchema,
  websiteSchema,
} from "@/lib/seo";

export const metadata: Metadata = {
  // Every relative canonical and OG image on the site resolves against this.
  // Without it Next emits relative URLs that no crawler or scraper can follow.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME}.in — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Every used-car dealer gets a professional digital showroom, inventory management across branches, and a sales CRM built for the way dealerships actually work.",
  applicationName: SITE_NAME,
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    siteName: `${SITE_NAME}.in`,
    locale: "en_IN",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME}.in` }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Rich results for car listings depend on a large image preview being
      // allowed; the default cap renders them as a thumbnail or not at all.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh antialiased">
        <JsonLd nodes={[organizationSchema(), websiteSchema()]} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
