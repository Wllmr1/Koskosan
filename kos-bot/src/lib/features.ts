import { env, type Env } from "@/env";

/**
 * Optional integrations. Each is on only when every value in its group is set,
 * so a half-filled .env never produces half-working behaviour.
 */
export function whatsappEnabled(e: Env = env()): boolean {
  return [
    e.WA_PHONE_NUMBER_ID,
    e.WA_ACCESS_TOKEN,
    e.WA_APP_SECRET,
    e.WA_VERIFY_TOKEN,
    e.WA_BOT_PHONE_E164,
    e.OWNER_PHONE_E164,
  ].every(Boolean);
}

export function paymentsLive(e: Env = env()): boolean {
  return Boolean(e.XENDIT_SECRET_KEY && e.XENDIT_WEBHOOK_TOKEN);
}

export function emailEnabled(e: Env = env()): boolean {
  return Boolean(e.RESEND_API_KEY);
}

/** The built-in "Simulasikan bayar" page exists only here. Never in production. */
export function fakePaymentsAllowed(e: Env = env(), nodeEnv = process.env.NODE_ENV): boolean {
  return !paymentsLive(e) && nodeEnv !== "production";
}

export function assertProductionReady(e: Env = env(), nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === "production" && !paymentsLive(e)) {
    throw new Error(
      "Production needs XENDIT_SECRET_KEY and XENDIT_WEBHOOK_TOKEN. Fake payments are development-only."
    );
  }
}
