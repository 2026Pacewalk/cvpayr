/**
 * Showroom templates.
 *
 * Five genuinely different websites, not one website with five colour swatches.
 * Each carries its own typeface pairing, shape language, spacing rhythm, hero
 * composition and section treatment — a dealer who picks Atelier should not be
 * able to tell it shares a codebase with Velocity.
 *
 * Pure and client-safe: the picker in the CRM and the public showroom both read
 * from here, so a preview can never promise something the live site does not do.
 */

export const TEMPLATE_KEYS = [
  "momentum",
  "metro",
  "velocity",
  "atelier",
  "kinetic",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** How the hero is composed. Each is a separate branch in the showroom page. */
export type HeroVariant =
  | "overlay" // full-bleed photograph, search floating over it
  | "split" // oversized type on the left, one image on the right
  | "stage" // dark full-bleed, huge uppercase headline, minimal chrome
  | "centred" // small centred image, generous air, hairline rules
  | "stacked"; // colour block, then a card carrying the search

/** How a section heading presents itself. */
export type HeadingStyle = "left" | "centred";

/** The small label above a section title. */
export type EyebrowStyle = "pill" | "rule" | "caps" | "none";

export type TemplateTokens = {
  /** Border radius, in px, applied through CSS variables. */
  radiusCard: number;
  radiusButton: number;
  radiusImage: number;
  radiusChip: number;
  /** Vertical rhythm between sections, as Tailwind spacing steps. */
  sectionY: string;
  /** Base weight for display type. */
  displayWeight: number;
  /** Tracking for display type, in em. */
  displayTracking: string;
  /** Body copy size, px. */
  bodySize: number;
};

export type TemplateDefinition = {
  key: TemplateKey;
  name: string;
  /** One line a dealer can decide from. */
  tagline: string;
  /** Who it suits — shown under the name in the picker. */
  bestFor: string;
  fonts: {
    display: string;
    body: string;
    /** Full Google Fonts stylesheet URL for this pairing only. */
    href: string;
    /** CSS font-family stacks. */
    displayStack: string;
    bodyStack: string;
  };
  hero: HeroVariant;
  heading: HeadingStyle;
  eyebrow: EyebrowStyle;
  /** Sections sit on a dark ground rather than white. */
  dark: boolean;
  tokens: TemplateTokens;
  /** Fallback accent when a dealer has not chosen one. */
  defaultAccent: string;
  /** Three colours that describe the template at a glance in the picker. */
  swatch: [string, string, string];
};

const GF = "https://fonts.googleapis.com/css2";

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  /* ------------------------------------------------------------------ */
  momentum: {
    key: "momentum",
    name: "Momentum",
    tagline: "Clean, modern and quick to scan.",
    bestFor: "Most dealerships. Photography-led, works on any screen.",
    fonts: {
      display: "Sora",
      body: "Inter",
      href: `${GF}?family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap`,
      displayStack: '"Sora", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
    },
    hero: "overlay",
    heading: "left",
    eyebrow: "pill",
    dark: false,
    tokens: {
      radiusCard: 14,
      radiusButton: 11,
      radiusImage: 12,
      radiusChip: 999,
      sectionY: "py-14 sm:py-20",
      displayWeight: 600,
      displayTracking: "-0.02em",
      bodySize: 14.5,
    },
    defaultAccent: "#2f5be0",
    swatch: ["#0a0e16", "#2f5be0", "#f4f6fa"],
  },

  /* ------------------------------------------------------------------ */
  metro: {
    key: "metro",
    name: "Metro",
    tagline: "Editorial and unhurried, like a motoring supplement.",
    bestFor: "Dealers who write about their cars and want to be read.",
    fonts: {
      display: "Fraunces",
      body: "Inter",
      href: `${GF}?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap`,
      displayStack: '"Fraunces", ui-serif, Georgia, serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
    },
    hero: "split",
    heading: "left",
    eyebrow: "rule",
    dark: false,
    tokens: {
      // Near-square corners and hairline rules do the work instead of shadow.
      radiusCard: 3,
      radiusButton: 3,
      radiusImage: 3,
      radiusChip: 3,
      sectionY: "py-16 sm:py-24",
      displayWeight: 600,
      displayTracking: "-0.015em",
      bodySize: 15,
    },
    defaultAccent: "#1f3a5f",
    swatch: ["#1c1917", "#1f3a5f", "#faf9f7"],
  },

  /* ------------------------------------------------------------------ */
  velocity: {
    key: "velocity",
    name: "Velocity",
    tagline: "Dark, loud and built for performance stock.",
    bestFor: "Sports, luxury imports and modified cars.",
    fonts: {
      display: "Archivo",
      body: "Inter",
      href: `${GF}?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&display=swap`,
      displayStack: '"Archivo", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
    },
    hero: "stage",
    heading: "left",
    eyebrow: "caps",
    dark: true,
    tokens: {
      radiusCard: 8,
      radiusButton: 999,
      radiusImage: 8,
      radiusChip: 999,
      sectionY: "py-16 sm:py-24",
      displayWeight: 800,
      displayTracking: "-0.03em",
      bodySize: 14.5,
    },
    defaultAccent: "#e4322b",
    swatch: ["#08090c", "#e4322b", "#1a1c22"],
  },

  /* ------------------------------------------------------------------ */
  atelier: {
    key: "atelier",
    name: "Atelier",
    tagline: "Quiet, spacious and expensive-looking.",
    bestFor: "Premium and low-volume dealerships.",
    fonts: {
      display: "Cormorant Garamond",
      body: "Jost",
      href: `${GF}?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500&display=swap`,
      displayStack: '"Cormorant Garamond", ui-serif, Georgia, serif',
      bodyStack: '"Jost", ui-sans-serif, system-ui, sans-serif',
    },
    hero: "centred",
    heading: "centred",
    eyebrow: "caps",
    dark: false,
    tokens: {
      radiusCard: 2,
      radiusButton: 2,
      radiusImage: 2,
      radiusChip: 2,
      // Air is the whole point of this one.
      sectionY: "py-20 sm:py-32",
      displayWeight: 500,
      displayTracking: "-0.005em",
      bodySize: 14.5,
    },
    defaultAccent: "#8a6a3f",
    swatch: ["#26221d", "#8a6a3f", "#f7f4ef"],
  },

  /* ------------------------------------------------------------------ */
  kinetic: {
    key: "kinetic",
    name: "Kinetic",
    tagline: "Warm, rounded and friendly on a phone.",
    bestFor: "High-street dealers selling family cars.",
    fonts: {
      display: "Outfit",
      body: "DM Sans",
      href: `${GF}?family=DM+Sans:wght@400;500;700&family=Outfit:wght@500;600;700&display=swap`,
      displayStack: '"Outfit", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    },
    hero: "stacked",
    heading: "left",
    eyebrow: "pill",
    dark: false,
    tokens: {
      radiusCard: 22,
      radiusButton: 999,
      radiusImage: 18,
      radiusChip: 999,
      sectionY: "py-14 sm:py-20",
      displayWeight: 700,
      displayTracking: "-0.025em",
      bodySize: 15,
    },
    defaultAccent: "#f4801f",
    swatch: ["#1b1a17", "#f4801f", "#fff8f1"],
  },
};

export const TEMPLATE_LIST: TemplateDefinition[] = TEMPLATE_KEYS.map((k) => TEMPLATES[k]);

/** Never throws — an unknown value from an older row falls back to the default. */
export function resolveTemplate(key: string | null | undefined): TemplateDefinition {
  return TEMPLATES[(key ?? "") as TemplateKey] ?? TEMPLATES.momentum;
}

export function isTemplateKey(key: string): key is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(key);
}

/**
 * The CSS custom properties a template contributes. Applied once on the
 * showroom root, so every component below reads shape and type from one place
 * instead of hardcoding a radius.
 */
export function templateVars(
  template: TemplateDefinition,
  accent?: string | null,
): Record<string, string> {
  const t = template.tokens;
  return {
    "--tpl-font-display": template.fonts.displayStack,
    "--tpl-font-body": template.fonts.bodyStack,
    "--tpl-radius-card": `${t.radiusCard}px`,
    "--tpl-radius-button": `${t.radiusButton}px`,
    "--tpl-radius-image": `${t.radiusImage}px`,
    "--tpl-radius-chip": `${t.radiusChip}px`,
    "--tpl-display-weight": String(t.displayWeight),
    "--tpl-display-tracking": t.displayTracking,
    "--tpl-body-size": `${t.bodySize}px`,
    "--tpl-accent": accent || template.defaultAccent,
  };
}
