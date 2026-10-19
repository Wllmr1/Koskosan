import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { log } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import { paymentsLive } from "@/lib/features";
import { expireInvoiceByCode, recordPayment } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Xendit tells us a payment landed. Verified here; everything else is recordPayment. */
export async function POST(req: NextRequest) {
  if (!paymentsLive()) return new NextResponse("not found", { status: 404 });

  const token = req.headers.get("x-callback-token") ?? "";
  if (!safeEqual(token, env().XENDIT_WEBHOOK_TOKEN)) {
    log.warn("xendit webhook: bad callback token");
    return new NextResponse("invalid token", { status: 401 });
  }

  const event = (await req.json().catch(() => null)) as XenditEvent | null;
  if (!event?.id || !event.external_id) return NextResponse.json({ ok: true });

  if (event.status === "EXPIRED") {
    await expireInvoiceByCode(event.external_id);
    return NextResponse.json({ ok: true });
  }
  if (event.status !== "PAID" && event.status !== "SETTLED") return NextResponse.json({ ok: true });

  await recordPayment({
    invoiceCode: event.external_id,
    eventId: `xendit:${event.id}`,
    amount: Number(event.paid_amount ?? event.amount ?? 0),
    method: String(event.payment_method ?? event.payment_channel ?? "UNKNOWN"),
    paidAt: event.paid_at ? new Date(event.paid_at) : new Date(),
    raw: event,
  });
  return NextResponse.json({ ok: true });
}

type XenditEvent = {
  id: string;
  external_id: string;
  status: string;
  amount?: number;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: string;
  payment_channel?: string;
};
