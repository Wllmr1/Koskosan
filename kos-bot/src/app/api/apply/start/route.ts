import { NextRequest, NextResponse } from "next/server";
import { LeasePlan } from "@prisma/client";
import { ApplicationError, createApplication } from "@/lib/application";
import { resolveWebContext } from "@/lib/chat/context";
import { clientIp, sameOrigin } from "@/lib/http";
import { log } from "@/lib/logger";
import { overLimit } from "@/lib/rate-limit";
import { anonIdFromCookie, CHAT_COOKIE, newAnonId, setChatCookie } from "@/lib/web-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Sewa kamar ini" on a room page: start the same secure sign-up flow the
 * assistant sends, without chatting. The application is linked to the
 * visitor's anonymous chat session, so the confirmation also appears in the
 * chat and personal data follows the same retention rules.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });

  const form = await req.formData();
  const code = String(form.get("room") ?? "").trim().toUpperCase().slice(0, 20);
  const plan = String(form.get("plan") ?? "") === "tahunan" ? LeasePlan.YEARLY : LeasePlan.MONTHLY;
  const backToRoom = (reason: string) =>
    NextResponse.redirect(new URL(`/kamar/${encodeURIComponent(code)}?sewa=${reason}`, req.url), { status: 303 });

  if (!/^[A-Z0-9-]{2,20}$/.test(code)) return NextResponse.redirect(new URL("/kamar", req.url), { status: 303 });
  if (await overLimit("apply-web", clientIp(req), 5, 3_600_000)) return backToRoom("batas");

  let anonId = anonIdFromCookie(req.cookies.get(CHAT_COOKIE)?.value);
  let newCookie: string | null = null;
  if (!anonId) {
    const fresh = newAnonId();
    anonId = fresh.id;
    newCookie = fresh.cookie;
  }
  const ctx = await resolveWebContext({ anonId, tenantId: null });

  try {
    const { reference, token } = await createApplication({ contactId: ctx.contactId, roomCode: code, plan });
    log.info("application started on website", { reference });
    const res = NextResponse.redirect(new URL(`/apply/${token}`, req.url), { status: 303 });
    if (newCookie) setChatCookie(res, newCookie);
    return res;
  } catch (e) {
    if (e instanceof ApplicationError) return backToRoom(e.code === "unavailable" ? "penuh" : "tidak-ada");
    throw e;
  }
}
