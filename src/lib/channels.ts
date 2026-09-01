import "server-only";

/**
 * Outbound delivery channels.
 *
 * The architecture is here and the call sites are wired, but nothing is faked:
 * if no provider is configured, `send` returns `{ sent: false, reason }` and the
 * UI says the channel is not connected. Nothing anywhere claims a message went
 * out that did not.
 *
 * To switch a channel on, set its environment variables and implement the
 * marked block. No call site changes.
 */

export type SendResult =
  | { sent: true; id?: string }
  | { sent: false; reason: "not_configured" | "invalid_recipient" | "provider_error"; detail?: string };

/* -------------------------------- EMAIL -------------------------------- */

/**
 * True when an email provider is fully configured. Checked before any UI
 * offers email delivery, and before any send is attempted.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
}

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. Kept simple deliberately: transactional alerts, not marketing. */
  text: string;
  replyTo?: string;
};

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  if (!message.to.includes("@")) return { sent: false, reason: "invalid_recipient" };

  try {
    // ---- Implement your provider here (Resend, SES, Postmark, SMTP) ----
    // The shape below matches Resend's REST API; swap the URL and body for
    // another provider without touching anything that calls sendEmail().
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      return {
        sent: false,
        reason: "provider_error",
        detail: `${response.status} ${await response.text().catch(() => "")}`.slice(0, 300),
      };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (error) {
    return {
      sent: false,
      reason: "provider_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/* ------------------------------ WHATSAPP ------------------------------- */

/**
 * The WhatsApp Business API needs an approved business account, a phone number
 * id and approved message templates. Until all three exist this returns false,
 * and the app keeps using `wa.me` deep links — which genuinely work today and
 * open the dealer's own WhatsApp with the message pre-filled.
 */
export function whatsappApiConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_API_VERSION,
  );
}

export type WhatsAppMessage = {
  /** 10-digit Indian mobile, or a full international number. */
  to: string;
  /** Name of an approved template. Free-form text is rejected outside a session. */
  template: string;
  /** Ordered body parameters for the template. */
  parameters?: string[];
  languageCode?: string;
};

export async function sendWhatsApp(message: WhatsAppMessage): Promise<SendResult> {
  if (!whatsappApiConfigured()) return { sent: false, reason: "not_configured" };

  const digits = message.to.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  if (to.length < 11) return { sent: false, reason: "invalid_recipient" };

  try {
    // ---- Meta Cloud API. Gupshup / Twilio need only this block changed. ----
    const version = process.env.WHATSAPP_API_VERSION;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: message.template,
          language: { code: message.languageCode ?? "en" },
          ...(message.parameters?.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: message.parameters.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      }),
    });

    if (!response.ok) {
      return {
        sent: false,
        reason: "provider_error",
        detail: `${response.status} ${await response.text().catch(() => "")}`.slice(0, 300),
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      messages?: { id: string }[];
    };
    return { sent: true, id: data.messages?.[0]?.id };
  } catch (error) {
    return {
      sent: false,
      reason: "provider_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Everything the settings screen needs to describe the current state honestly. */
export function channelStatus() {
  return {
    inApp: { configured: true, label: "In-app" },
    browserPush: { configured: true, label: "Browser" },
    email: { configured: emailConfigured(), label: "Email" },
    whatsapp: { configured: whatsappApiConfigured(), label: "WhatsApp" },
  };
}
