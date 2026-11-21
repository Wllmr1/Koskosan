import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short, stable bill link: /p/INV-RENT-2610-0004
 *
 * WhatsApp template buttons are fixed at approval time, so reminders already
 * sent keep pointing here. Payment is a bank transfer with a proof upload on
 * the renter's account page, so every bill link now lands there.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const anchor = /^[A-Z0-9-]{6,40}$/i.test(code) ? `#${code.toUpperCase()}` : "";
  return NextResponse.redirect(`${env().APP_URL}/akun${anchor}`, { status: 302 });
}
