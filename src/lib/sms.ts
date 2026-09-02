/**
 * SMS templates and DLT placeholder handling.
 *
 * Pure and client-safe. Indian operators only deliver messages whose text
 * matches a template registered on the DLT platform, character for character.
 * That constraint shapes this whole module: the body is stored exactly as
 * registered, and the only thing we are allowed to change is the value of a
 * `{#var#}` placeholder.
 */

/** The placeholder syntax DLT uses. `{#var#}`, `{#cbn#}` and so on. */
const PLACEHOLDER = /\{#(\w+)#\}/g;

/**
 * Placeholders this app knows how to fill. Anything else in a template is left
 * exactly as it is rather than being blanked out, because a half-substituted
 * message fails DLT matching and the operator drops it silently.
 */
export const SMS_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "cbn", label: "IVR / callback number", example: "1800 200 1234" },
  { key: "name", label: "Customer name", example: "Rahul Sharma" },
  { key: "var", label: "Generic value", example: "—" },
];

export type SmsContext = {
  /** The dealership's IVR number, for {#cbn#}. */
  ivrNumber?: string | null;
  customerName?: string | null;
  /** Anything else, keyed by placeholder name. */
  extra?: Record<string, string | null | undefined>;
};

/**
 * Fills the placeholders a template uses.
 *
 * Returns the unresolved names as well, so a caller can refuse to send rather
 * than push a message with a literal `{#cbn#}` in it to a customer.
 */
export function renderSms(
  body: string,
  context: SmsContext,
): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];

  const text = body.replace(PLACEHOLDER, (match, name: string) => {
    const value =
      name === "cbn"
        ? context.ivrNumber
        : name === "name"
          ? context.customerName
          : context.extra?.[name];

    if (value === null || value === undefined || String(value).trim() === "") {
      unresolved.push(name);
      return match;
    }
    return String(value).trim();
  });

  return { text, unresolved };
}

/** The placeholder names a template contains, in order, without duplicates. */
export function smsPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/* ----------------------------- SEGMENTS ------------------------------ */

/**
 * A GSM-7 message is 160 characters; anything outside that alphabet forces
 * UCS-2 and drops the limit to 70. Dealers are billed per segment, so the
 * editor shows this rather than letting a stray curly quote triple the cost.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export function isGsm7(text: string): boolean {
  return [...text].every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
}

export function smsSegments(text: string): {
  encoding: "GSM-7" | "Unicode";
  characters: number;
  segments: number;
  perSegment: number;
} {
  const gsm = isGsm7(text);
  // Extended characters take two septets each.
  const length = gsm
    ? [...text].reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0)
    : text.length;

  const single = gsm ? 160 : 70;
  const concatenated = gsm ? 153 : 67;
  const segments = length <= single ? 1 : Math.ceil(length / concatenated);

  return {
    encoding: gsm ? "GSM-7" : "Unicode",
    characters: length,
    segments: Math.max(1, segments),
    perSegment: segments <= 1 ? single : concatenated,
  };
}

/* --------------------------- PHONE NUMBERS --------------------------- */

/**
 * Indian gateways expect a bare ten-digit number or one with the 91 prefix.
 * Returns null rather than guessing when it cannot make a valid number, so a
 * malformed contact is reported instead of silently failing at the gateway.
 */
export function toSmsNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return null;
}

/* ---------------------------- DEFAULTS ------------------------------- */

/**
 * Templates seeded for a new dealership. Each must be registered on DLT with the
 * operator before it will actually deliver — the settings screen says so.
 */
export const DEFAULT_SMS_TEMPLATES: {
  key: string;
  name: string;
  body: string;
}[] = [
  {
    key: "service_thank_you",
    name: "Service — thank you & feedback",
    body:
      "Dear Customer, Thank you for visiting {#var#} for your vehicle service. " +
      "We hope you had a smooth and satisfactory experience and that all your concerns " +
      "were addressed. For more enquiry call on our IVR Number {#cbn#}. " +
      "Your feedback matters to us. – {#var#}",
  },
];
