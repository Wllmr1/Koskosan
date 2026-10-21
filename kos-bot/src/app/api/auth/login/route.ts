import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { normalizePhone } from "@/lib/money";
import { clientIp, sameOrigin } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { renterCookieValue, setRenterCookie } from "@/lib/renter-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Checked when the phone is unknown, so a wrong phone takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  const back = (query: string) => NextResponse.redirect(new URL(`/masuk?${query}`, req.url), { status: 303 });

  const ip = clientIp(req);
  const form = await req.formData();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "").slice(0, 200);
  const { renterLogin: perPhone, renterLoginIp: perIp } = LIMITS;

  // Count the attempt BEFORE checking the password, so a burst of parallel
  // requests cannot all slip past the limit while scrypt is still running.
  const ipLocked = await overLimit("login-ip", ip, perIp.limit, perIp.windowMs);
  const phoneLocked = phone ? await overLimit("login-phone", phone, perPhone.limit, perPhone.windowMs) : false;
  if (ipLocked || phoneLocked) return back("locked=1");

  const tenant = phone ? await prisma.tenant.findUnique({ where: { phoneE164: phone } }) : null;
  const ok = tenant?.passwordHash
    ? await verifyPassword(password, tenant.passwordHash)
    : (await verifyPassword(password, await (dummyHash ??= hashPassword("not-a-real-password"))), false);

  if (!tenant || !ok) {
    log.warn("renter login failed");
    return back("error=1");
  }

  // A successful login clears this phone's attempts, so a renter on several devices is not locked out.
  const bucket = Math.floor(Date.now() / perPhone.windowMs);
  await prisma.rateCounter.deleteMany({ where: { key: `login-phone:${tenant.phoneE164}:${bucket}` } });

  await prisma.auditLog.create({ data: { actor: "tenant", action: "renter:login", tenantId: tenant.id } });
  const res = NextResponse.redirect(new URL("/akun", req.url), { status: 303 });
  setRenterCookie(res, renterCookieValue(tenant.id, tenant.sessionVersion));
  return res;
}
