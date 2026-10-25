import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorOf, loginAdmin, setAdminCookie } from "@/lib/admin-auth";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { clientIp, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  const back = (query: string) => NextResponse.redirect(new URL(`/admin/login?${query}`, req.url), { status: 303 });

  // Counted before the password check, so parallel guesses cannot slip past the limit.
  const ip = clientIp(req);
  if (await overLimit("admin-login", ip, LIMITS.adminLogin.limit, LIMITS.adminLogin.windowMs)) return back("error=limit");

  const form = await req.formData();
  const result = await loginAdmin(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!result) {
    // Never the email or password: a typo'd password is often the real one for something else.
    log.warn("admin login failed", { ip });
    return back("error=1");
  }

  await prisma.auditLog.create({ data: { actor: actorOf(result.identity), action: "admin:login" } });
  const res = NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
  setAdminCookie(res, result.cookie);
  return res;
}
