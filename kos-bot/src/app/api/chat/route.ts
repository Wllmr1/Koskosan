import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findWebContactId, resolveWebContext } from "@/lib/chat/context";
import { handleInbound, RATE_REPLY_DAY, RATE_REPLY_MINUTE } from "@/lib/chat/pipeline";
import { chatAllowance } from "@/lib/chat/allowance";
import { BLOCKED_REPLY } from "@/lib/chat/rules";
import { webTranscript } from "@/lib/chat/transcript";
import { clientIp, sameOrigin } from "@/lib/http";
import { newAnonId, readAnonId, setChatCookie } from "@/lib/web-session";
import { currentRenter } from "@/lib/renter-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ message: z.string().trim().min(1).max(600) });

/** The conversation so far, for when the chat window opens. Creates nothing. */
export async function GET() {
  const anonId = await readAnonId();
  const renter = await currentRenter();
  const tenantId = renter?.id ?? null;
  const contactId = await findWebContactId({ anonId, tenantId });
  return NextResponse.json(
    { messages: contactId ? await webTranscript(contactId) : [], renter: renter ? { firstName: renter.fullName.split(" ")[0] } : null },
    { headers: { "cache-control": "no-store" } }
  );
}

/** One message from the website chat. Same pipeline as WhatsApp. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const allowance = await chatAllowance(clientIp(req));
  if (allowance !== "ok") {
    return NextResponse.json({ reply: allowance === "day" ? RATE_REPLY_DAY : RATE_REPLY_MINUTE, actions: [] }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pesan kosong atau terlalu panjang (maks. 600 karakter)." }, { status: 400 });
  }

  let anonId = await readAnonId();
  let newCookie: string | null = null;
  if (!anonId) {
    const fresh = newAnonId();
    anonId = fresh.id;
    newCookie = fresh.cookie;
  }

  const tenantId = (await currentRenter())?.id ?? null;
  const ctx = await resolveWebContext({ anonId, tenantId });
  const reply = await handleInbound(ctx, parsed.data.message);

  const res = NextResponse.json({ reply: reply?.text ?? BLOCKED_REPLY, actions: reply?.actions ?? [] });
  if (newCookie) setChatCookie(res, newCookie);
  return res;
}
