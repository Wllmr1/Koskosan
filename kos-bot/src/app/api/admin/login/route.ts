import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { safeEqual, signSession } from "@/lib/crypto";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { clientIp } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await overLimit("admin-login", ip, LIMITS.adminLogin.limit, LIMITS.adminLogin.windowMs)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  if (!safeEqual(password, env().ADMIN_PASSWORD)) {
    log.warn("admin login failed", { ip });
    return NextResponse.redirect(new URL("/admin/login?error=1", req.url), { status: 303 });
  }

  const res = NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, signSession("owner", SESSION_TTL_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
