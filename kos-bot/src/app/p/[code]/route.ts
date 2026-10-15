import { NextRequest, NextResponse } from "next/server";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePaymentUrl } from "@/lib/billing";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short, stable pay link: /p/INV-RENT-2610-0004
 *
 * WhatsApp template buttons are fixed at approval time with one variable, so
 * the link we send must never change. This route resolves the invoice code to
 * a fresh Xendit page each time, which also means an expired gateway link
 * silently regenerates instead of dead-ending the tenant.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^[A-Z0-9-]{6,40}$/i.test(code)) return NextResponse.redirect(env().APP_URL, { status: 302 });

  const invoice = await prisma.invoice.findUnique({ where: { code: code.toUpperCase() } });
  if (!invoice) return NextResponse.redirect(env().APP_URL, { status: 302 });
  if (invoice.status === InvoiceStatus.PAID) {
    return NextResponse.redirect(`${env().APP_URL}/paid/${invoice.code}`, { status: 302 });
  }

  try {
    const url = await ensurePaymentUrl(invoice.id);
    return NextResponse.redirect(url, { status: 302 });
  } catch {
    return NextResponse.redirect(env().APP_URL, { status: 302 });
  }
}
