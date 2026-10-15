import { env } from "@/env";
import { log } from "./logger";

const graph = () => `https://graph.facebook.com/${env().WA_GRAPH_VERSION}/${env().WA_PHONE_NUMBER_ID}`;

async function post(payload: Record<string, unknown>) {
  const res = await fetch(`${graph()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env().WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) {
    const detail = await res.text();
    log.error("whatsapp send failed", { status: res.status, detail: detail.slice(0, 400) });
    throw new Error(`WhatsApp send failed: ${res.status}`);
  }
  return res.json();
}

/** Free-form reply. Only valid inside the 24-hour customer service window. */
export function sendText(to: string, body: string, preview = true) {
  return post({ to, type: "text", text: { preview_url: preview, body: body.slice(0, 4096) } });
}

/** Up to 3 buttons. Good for yes/no and short choices. */
export function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  });
}

/** Up to 10 rows. Used for the room list. */
export function sendList(
  to: string,
  body: string,
  buttonLabel: string,
  rows: { id: string; title: string; description?: string }[]
) {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: "Pilihan",
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

/** A tappable link button — used for the secure form and payment pages. */
export function sendCtaUrl(to: string, body: string, displayText: string, url: string) {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body.slice(0, 1024) },
      action: { name: "cta_url", parameters: { display_text: displayText.slice(0, 20), url } },
    },
  });
}

export function sendDocument(to: string, link: string, filename: string, caption?: string) {
  return post({ to, type: "document", document: { link, filename, caption: caption?.slice(0, 1024) } });
}

/**
 * Pre-approved template. Required to message someone outside the 24-hour window
 * (rent reminders, receipts, owner alerts).
 */
export function sendTemplate(to: string, name: string, languageCode: string, bodyParams: string[] = []) {
  return post({
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      ...(bodyParams.length
        ? { components: [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }] }
        : {}),
    },
  });
}

/**
 * Template with a dynamic URL button. Meta rejects raw links inside body
 * variables, so a payment or form link must ride on the button instead:
 * the template's button is defined as https://your.app/p/{{1}} and you pass
 * only the changing suffix here.
 */
export function sendTemplateWithUrlButton(
  to: string,
  name: string,
  languageCode: string,
  bodyParams: string[],
  urlSuffix: string
) {
  return post({
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: [
        ...(bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }]
          : []),
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: urlSuffix }],
        },
      ],
    },
  });
}

export async function markRead(messageId: string) {
  try {
    await post({ status: "read", message_id: messageId });
  } catch {
    /* read receipts are best-effort */
  }
}

/** WhatsApp wants bare digits, our DB stores +62… */
export const waIdFromE164 = (e164: string) => e164.replace(/\D/g, "");

/** A wa.me link to the assistant, or null while no WhatsApp number is set up. */
export function botChatLink(text?: string): string | null {
  const number = env().WA_BOT_PHONE_E164;
  if (!number) return null;
  const base = `https://wa.me/${waIdFromE164(number)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
