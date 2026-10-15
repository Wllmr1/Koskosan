import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import { whatsappEnabled } from "@/lib/features";
import { overLimit } from "@/lib/rate-limit";
import { markRead, sendCtaUrl, sendText } from "@/lib/whatsapp";
import { resolveWhatsAppContext } from "@/lib/chat/context";
import { handleInbound } from "@/lib/chat/pipeline";
import { TEXT_ONLY_REPLY } from "@/lib/chat/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta calls this once when you add the webhook URL. */
export async function GET(req: NextRequest) {
  if (!whatsappEnabled()) return new NextResponse("not found", { status: 404 });
  const params = req.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && safeEqual(params.get("hub.verify_token") ?? "", env().WA_VERIFY_TOKEN)) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  if (!whatsappEnabled()) return new NextResponse("not found", { status: 404 });
  const raw = await req.text();

  // 1. Only Meta may call this. Verified before anything is parsed.
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    log.warn("whatsapp webhook: bad signature");
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw) as WaWebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Meta may batch several messages (even from several people) into one call.
  const inbound = (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) =>
      (change.value?.messages ?? []).map((message) => ({ message, value: change.value! }))
    )
  );

  for (const { message, value } of inbound) {
    // 2. Meta retries aggressively. One message, one reply.
    try {
      await prisma.processedWebhook.create({ data: { key: `wa:${message.id}` } });
    } catch {
      continue;
    }
    // 3. Answer Meta inside its timeout, then do the slow work.
    after(() => handleMessage(message, value).catch((e) => log.error("handleMessage failed", { message: String(e) })));
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: WaMessage, value: WaValue) {
  const waId = message.from;
  await markRead(message.id);

  // Muted for repeated manipulation attempts: no reply, no tokens spent.
  const muted = await prisma.contact.findUnique({ where: { waId }, select: { blockedUntil: true } });
  if (muted?.blockedUntil && muted.blockedUntil > new Date()) return;

  // Media is never accepted in chat — KTP photos belong in the secure form.
  if (message.type !== "text" && message.type !== "interactive") {
    if (["image", "document", "video"].includes(message.type)) {
      await sendText(waId, "Demi keamanan, dokumen seperti KTP hanya diunggah lewat formulir aman ya kak, bukan lewat chat 🙏");
    } else if (["audio", "sticker", "location", "contacts"].includes(message.type)) {
      if (!(await overLimit("wa-nontext", waId, 3, 3_600_000))) await sendText(waId, TEXT_ONLY_REPLY);
    }
    return;
  }

  const text = extractText(message);
  if (!text) return;

  const ctx = await resolveWhatsAppContext(waId, value?.contacts?.[0]?.profile?.name);
  const reply = await handleInbound(ctx, text, { waMessageId: message.id });
  if (!reply) return;

  await sendText(waId, reply.text);
  for (const action of reply.actions) {
    await sendCtaUrl(waId, action.label, action.label, `${env().APP_URL}${action.path}`);
  }
}

function extractText(message: WaMessage): string {
  if (message.type === "text") return String(message.text?.body ?? "").slice(0, 600);
  const i = message.interactive;
  if (i?.type === "button_reply") return String(i.button_reply?.title ?? "").slice(0, 200);
  if (i?.type === "list_reply") return String(i.list_reply?.title ?? "").slice(0, 200);
  return "";
}

function validSignature(raw: string, header: string | null): boolean {
  if (!header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", env().WA_APP_SECRET).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* Minimal shapes for the parts of Meta's payload we use. */
type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};
type WaValue = { contacts?: { profile?: { name?: string } }[]; messages?: WaMessage[] };
type WaWebhookBody = { entry?: { changes?: { value?: WaValue }[] }[] };
