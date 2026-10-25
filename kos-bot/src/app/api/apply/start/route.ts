import { NextRequest, NextResponse } from "next/server";
import { ApplicationError, createApplication, createApplicationForType } from "@/lib/application";
import { resolveWebContext } from "@/lib/chat/context";
import { parseContractMonths } from "@/lib/contract-terms";
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
  const typeSlug = String(form.get("type") ?? "").trim().toLowerCase().slice(0, 60);
  const code = String(form.get("room") ?? "").trim().toUpperCase().slice(0, 20);
  const months = parseContractMonths(form.get("months"));
  const back = typeSlug || code;
  const backToRoom = (reason: string) =>
    NextResponse.redirect(new URL(`/kamar/${encodeURIComponent(back)}?sewa=${reason}`, req.url), { status: 303 });

  if (typeSlug ? !/^[a-z0-9-]{1,60}$/.test(typeSlug) : !/^[A-Z0-9-]{2,20}$/.test(code)) {
    return NextResponse.redirect(new URL("/kamar", req.url), { status: 303 });
  }
  if (!months) return backToRoom("lama");
  if (await overLimit("apply-web", clientIp(req), 5, 3_600_000)) return backToRoom("batas");

  // Calendar date as UTC midnight; absent, malformed or in the past means today.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const asked = new Date(`${String(form.get("moveIn") ?? "")}T00:00:00Z`);
  const moveIn = Number.isNaN(asked.getTime()) || asked < today ? today : asked;

  let anonId = anonIdFromCookie(req.cookies.get(CHAT_COOKIE)?.value);
  let newCookie: string | null = null;
  if (!anonId) {
    const fresh = newAnonId();
    anonId = fresh.id;
    newCookie = fresh.cookie;
  }
  const ctx = await resolveWebContext({ anonId, tenantId: null });

  try {
    const { reference, token } = typeSlug
      ? await createApplicationForType({ contactId: ctx.contactId, typeSlug, months, moveIn })
      : await createApplication({ contactId: ctx.contactId, roomCode: code, months });
    log.info("application started on website", { reference });
    const res = NextResponse.redirect(new URL(`/apply/${token}`, req.url), { status: 303 });
    if (newCookie) setChatCookie(res, newCookie);
    return res;
  } catch (e) {
    if (e instanceof ApplicationError) return backToRoom(e.code === "unavailable" ? "penuh" : "tidak-ada");
    throw e;
  }
}
