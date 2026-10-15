import { env } from "@/env";
import { log } from "./logger";

const BASE = "https://api.xendit.co";

function authHeader() {
  return "Basic " + Buffer.from(`${env().XENDIT_SECRET_KEY}:`).toString("base64");
}

export type XenditInvoice = { id: string; invoice_url: string; status: string; expiry_date: string };

/**
 * Creates a hosted invoice page. The amount always comes from our own
 * database — never from anything the model or the customer typed.
 */
export async function createInvoice(opts: {
  externalId: string;
  amount: number;
  description: string;
  payerEmail?: string;
  durationSeconds?: number;
  successRedirect?: string;
}): Promise<XenditInvoice> {
  const res = await fetch(`${BASE}/v2/invoices`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: opts.externalId,
      amount: opts.amount,
      description: opts.description,
      currency: "IDR",
      invoice_duration: opts.durationSeconds ?? 86_400,
      ...(opts.payerEmail ? { payer_email: opts.payerEmail } : {}),
      ...(opts.successRedirect ? { success_redirect_url: opts.successRedirect } : {}),
      payment_methods: ["QRIS", "BCA", "BNI", "BRI", "MANDIRI", "PERMATA", "OVO", "DANA", "SHOPEEPAY"],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    log.error("xendit invoice failed", { status: res.status, detail: detail.slice(0, 400) });
    throw new Error(`Xendit invoice failed: ${res.status}`);
  }
  return res.json();
}

export async function expireInvoice(invoiceId: string) {
  await fetch(`${BASE}/invoices/${invoiceId}/expire!`, {
    method: "POST",
    headers: { Authorization: authHeader() },
  }).catch(() => undefined);
}
