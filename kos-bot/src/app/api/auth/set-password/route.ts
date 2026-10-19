import { NextRequest, NextResponse } from "next/server";
import { clientIp, sameOrigin } from "@/lib/http";
import { consumePasswordSetup } from "@/lib/password-setup";
import { overLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  if (await overLimit("set-password", clientIp(req), 10, 15 * 60_000)) {
    return new NextResponse("Terlalu banyak percobaan. Coba lagi nanti.", { status: 429 });
  }

  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const result = await consumePasswordSetup(
    token,
    String(form.get("password") ?? ""),
    String(form.get("passwordConfirm") ?? "")
  );

  if (!result.ok) {
    const safeToken = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : "x";
    return NextResponse.redirect(
      new URL(`/atur-password/${safeToken}?error=${encodeURIComponent(result.error)}`, req.url),
      { status: 303 }
    );
  }
  return NextResponse.redirect(new URL("/masuk?set=1", req.url), { status: 303 });
}
