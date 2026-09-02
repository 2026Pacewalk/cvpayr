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

/* ---------------------------------- SMS -------------------------------- */

/**
 * Credentials belong to the dealership, not the platform, so they are passed in
 * rather than read from the environment. Each dealer has their own DLT-approved
 * sender ID and their own gateway account.
 */
export type SmsCredentials = {
  provider: string;
  username: string;
  password: string;
  senderId: string;
};

export type SmsMessage = {
  /** Already normalised to 91XXXXXXXXXX by toSmsNumber(). */
  to: string;
  /** The final text, with every DLT placeholder resolved. */
  text: string;
  /** True when the text contains characters outside GSM-7. */
  unicode?: boolean;
};

export function smsConfigured(creds: Partial<SmsCredentials> | null | undefined): boolean {
  return Boolean(creds?.username && creds?.password && creds?.senderId);
}

/**
 * Sends through SmartPing's HTTP API.
 *
 * The gateway answers 200 with a body that says whether it accepted the
 * message, so the status code alone is not enough — a body beginning with
 * "ERR" or containing "fail" is a rejection and is reported as one rather than
 * being counted as delivered.
 */
export async function sendSms(
  creds: SmsCredentials,
  message: SmsMessage,
): Promise<SendResult> {
  if (!smsConfigured(creds)) return { sent: false, reason: "not_configured" };
  if (!/^\d{10,13}$/.test(message.to)) return { sent: false, reason: "invalid_recipient" };

  try {
    const url = new URL("https://pgapi.smartping.ai/fe/api/v1/send");
    url.searchParams.set("username", creds.username);
    url.searchParams.set("password", creds.password);
    url.searchParams.set("unicode", message.unicode ? "true" : "false");
    url.searchParams.set("from", creds.senderId);
    url.searchParams.set("to", message.to);
    url.searchParams.set("text", message.text);

    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const body = (await response.text()).trim();

    if (!response.ok) {
      return {
        sent: false,
        reason: "provider_error",
        detail: `${response.status} ${body}`.slice(0, 300),
      };
    }

    // SmartPing returns 200 even when it refuses the message.
    if (/^err|fail|invalid|insufficient|blocked|reject/i.test(body)) {
      return { sent: false, reason: "provider_error", detail: body.slice(0, 300) };
    }

    // A successful response carries a message id; keep it for the audit trail.
    const id = body.match(/[0-9a-f]{8,}/i)?.[0] ?? body.slice(0, 80);
    return { sent: true, id };
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
