import { ImageResponse } from "next/og";
import { getDealerBySlug } from "@/server/dealer";

/**
 * The showroom's own browser-tab icon.
 *
 * A white-label storefront that shows the platform's favicon reads as somebody
 * else's website, so each dealer gets their initials on their chosen accent
 * colour. Initials rather than the uploaded logo: a logo is an arbitrary remote
 * image of unknown shape and aspect, and fetching one per icon request would
 * add a network round trip to something the browser asks for on every page.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Up to two initials — more than that is unreadable in a 16px tab. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export default async function Icon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dealer = await getDealerBySlug(slug);

  const accent = dealer?.websiteSettings?.themeAccent ?? "#2f5be0";
  const label = dealer ? initials(dealer.name) : "CV";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: accent,
          color: "#ffffff",
          fontSize: label.length > 1 ? 30 : 38,
          fontWeight: 700,
          letterSpacing: -1,
          borderRadius: 14,
        }}
      >
        {label}
      </div>
    ),
    size,
  );
}
