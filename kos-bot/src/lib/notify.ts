import { env } from "@/env";
import { prisma } from "./prisma";
import { log } from "./logger";
import { sendTemplate, waIdFromE164 } from "./whatsapp";
import { emailEnabled, whatsappEnabled } from "./features";

type OwnerAlert = {
  /** Stops the same alert going out twice, e.g. "contract:APP-1042" */
  dedupeKey: string;
  title: string;
  subject: string;
  /** Plain-text email body */
  body: string;
  /** Short line for the WhatsApp/SMS template — keep under ~120 chars */
  short: string;
  /** WhatsApp template name; must be approved in Meta Business Manager */
  template?: string;
};

const CHANNELS = ["email", "whatsapp"] as const;
type Channel = (typeof CHANNELS)[number];

/** Failed channels are retried hourly, up to this many attempts in total. */
const MAX_ATTEMPTS = 8;

/** Channels that are set up. A channel that is not configured is skipped, not failed. */
function enabledChannels(): Channel[] {
  return CHANNELS.filter((c) => (c === "email" ? emailEnabled() : whatsappEnabled()));
}

/**
 * Tells the owner something happened: email + a WhatsApp text.
 * Every alert is recorded, so a retried webhook never double-notifies, and a
 * channel that failed is retried by the hourly job until it gets through.
 */
export async function notifyOwner(alert: OwnerAlert): Promise<void> {
  const existing = await prisma.ownerNotification.findUnique({ where: { dedupeKey: alert.dedupeKey } });
  if (existing) return;

  const { sent, errors } = await deliver(alert, enabledChannels());

  await prisma.ownerNotification.create({
    data: {
      dedupeKey: alert.dedupeKey,
      title: alert.title,
      subject: alert.subject,
      body: alert.body,
      sms: alert.short,
      template: alert.template ?? "owner_alert",
      channels: sent.join(","),
      error: errors.length ? errors.join(" | ") : null,
    },
  });

  if (errors.length) log.error("owner alert partially failed", { dedupeKey: alert.dedupeKey, errors });
}

/** Hourly: re-sends any channel that failed on a recent alert. */
export async function retryOwnerAlerts(): Promise<number> {
  const pending = await prisma.ownerNotification.findMany({
    where: {
      error: { not: null },
      attempts: { lt: MAX_ATTEMPTS },
      sentAt: { gte: new Date(Date.now() - 3 * 86_400_000) },
    },
    take: 50,
  });

  for (const row of pending) {
    const done = row.channels.split(",").filter(Boolean) as Channel[];
    const missing = enabledChannels().filter((c) => !done.includes(c));
    const { sent, errors } = await deliver(
      { dedupeKey: row.dedupeKey, title: row.title, subject: row.subject, body: row.body, short: row.sms, template: row.template },
      missing
    );
    await prisma.ownerNotification.update({
      where: { id: row.id },
      data: {
        channels: [...done, ...sent].join(","),
        error: errors.length ? errors.join(" | ") : null,
        attempts: { increment: 1 },
      },
    });
    if (errors.length) log.error("owner alert retry failed", { dedupeKey: row.dedupeKey, errors });
  }
  return pending.length;
}

async function deliver(alert: OwnerAlert, channels: Channel[]) {
  const sent: Channel[] = [];
  const errors: string[] = [];

  if (channels.includes("email")) {
    try {
      await sendEmail(env().OWNER_EMAIL, alert.subject, alert.body);
      sent.push("email");
    } catch (e) {
      errors.push(`email: ${(e as Error).message}`);
    }
  }

  if (channels.includes("whatsapp")) {
    try {
      await sendTemplate(waIdFromE164(env().OWNER_PHONE_E164), alert.template ?? "owner_alert", "id", [
        alert.title,
        alert.short,
      ]);
      sent.push("whatsapp");
    } catch (e) {
      errors.push(`whatsapp: ${(e as Error).message}`);
    }
  }

  return { sent, errors };
}

/** Resend. Without RESEND_API_KEY the email fails loudly and shows on the dashboard. */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = env().RESEND_API_KEY;
  if (!key) throw new Error("email is not configured (RESEND_API_KEY)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
