import { NextRequest, NextResponse } from "next/server";
import { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findApplicationByToken } from "@/lib/application";
import { createPasswordSetupLink } from "@/lib/password-setup";
import { overLimit } from "@/lib/rate-limit";
import { clientIp, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Buat akun" on the application page once the deposit is verified: whoever
 * holds the application link may set the account's first password. Never for
 * an account that already has one (that is what "Lupa password" is for).
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  if (await overLimit("apply-account", clientIp(req), 10, 3_600_000)) return new NextResponse("too many", { status: 429 });

  const token = String((await req.formData()).get("token") ?? "");
  const app = await findApplicationByToken(token);
  if (!app || app.status !== ApplicationStatus.VERIFIED || !app.phoneE164) {
    return NextResponse.redirect(new URL("/masuk", req.url), { status: 303 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { phoneE164: app.phoneE164 } });
  if (!tenant || tenant.passwordHash) return NextResponse.redirect(new URL("/masuk", req.url), { status: 303 });

  const link = await createPasswordSetupLink(tenant.id);
  return NextResponse.redirect(new URL(new URL(link).pathname, req.url), { status: 303 });
}
