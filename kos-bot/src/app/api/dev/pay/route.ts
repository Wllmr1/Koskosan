import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fakePaymentsAllowed } from "@/lib/features";
import { sameOrigin } from "@/lib/http";
import { expireInvoiceByCode, recordPayment } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the real post-payment code with a simulated payment. Development only. */
export async function POST(req: NextRequest) {
  if (!fakePaymentsAllowed()) return new NextResponse("not found", { status: 404 });
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });

  const form = await req.formData();
  const code = String(form.get("code") ?? "").toUpperCase();
  const outcome = String(form.get("outcome") ?? "");
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return new NextResponse("bad request", { status: 400 });

  const invoice = await prisma.invoice.findUnique({ where: { code } });
  if (!invoice) return new NextResponse("not found", { status: 404 });

  if (outcome === "expire") {
    await expireInvoiceByCode(code);
    return NextResponse.redirect(new URL(`/dev/pay/${code}`, req.url), { status: 303 });
  }

  if (invoice.status !== InvoiceStatus.PAID) {
    await recordPayment({
      invoiceCode: code,
      eventId: `sim-${crypto.randomUUID()}`,
      amount: invoice.amount - invoice.amountPaid,
      method: "SIMULATED",
      paidAt: new Date(),
      raw: { simulated: true },
    });
  }
  return NextResponse.redirect(new URL(`/paid/${code}`, req.url), { status: 303 });
}
