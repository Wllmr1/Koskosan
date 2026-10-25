import { NextRequest, NextResponse } from "next/server";
import { clientIp, sameOrigin } from "@/lib/http";
import { consumeAdminSetup } from "@/lib/admin-auth";
import { LIMITS, overLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A helper chooses their password from the one-time link the owner sent them. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  if (await overLimit("admin-setup", clientIp(req), LIMITS.adminSetup.limit, LIMITS.adminSetup.windowMs)) {
    return new NextResponse("Terlalu banyak percobaan. Coba lagi nanti.", { status: 429 });
  }

  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const result = await consumeAdminSetup(token, String(form.get("password") ?? ""), String(form.get("passwordConfirm") ?? ""));

  if (!result.ok) {
    // Back to the page the helper is already on (its address is the link itself).
    const safeToken = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : "x";
    return NextResponse.redirect(new URL(`/admin/atur-password/${safeToken}?error=${encodeURIComponent(result.error)}`, req.url), {
      status: 303,
    });
  }
  return NextResponse.redirect(new URL("/admin/login?ready=1", req.url), { status: 303 });
}
