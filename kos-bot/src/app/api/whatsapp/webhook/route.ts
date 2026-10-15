import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { MessageRole } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { markRead, sendText } from "@/lib/whatsapp";
import { resolveContext, saveMessage } from "@/lib/chat/context";
import { runAssistant, estimateCostUsd, stripLog } from "@/lib/chat/assistant";
import {
  BLOCKED_REPLY,
  guardReply,
  INJECTION_STRIKES,
  looksLikeInjection,
  OFF_TOPIC_REPLY,
  TEXT_ONLY_REPLY,
} from "@/lib/chat/rules";
import { maskPhone, safeEqual } from "@/lib/crypto";
import { notifyOwner } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta calls this once when you add the webhook URL. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    safeEqual(params.get("hub.verify_token") ?? "", env().WA_VERIFY_TOKEN)
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
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
  // Every one of them gets an answer. Delivery and read receipts carry none.
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
      await sendText(
        waId,
        "Demi keamanan, dokumen seperti KTP hanya diunggah lewat formulir aman ya kak, bukan lewat chat 🙏"
      );
    } else if (["audio", "sticker", "location", "contacts"].includes(message.type)) {
      if (!(await overLimit("wa-nontext", waId, 3, 3_600_000))) await sendText(waId, TEXT_ONLY_REPLY);
    }
    return;
  }

  const text = extractText(message);
  if (!text) return;

  // 4. Cheap abuse limits before a single token is spent.
  if (await overLimit("wa-min", waId, LIMITS.waPerMinute.limit, LIMITS.waPerMinute.windowMs)) {
    log.warn("rate limited per minute", { waId: "[redacted]" });
    return;
  }
  if (await overLimit("wa-day", waId, LIMITS.waPerDay.limit, LIMITS.waPerDay.windowMs)) {
    await sendText(waId, "Maaf kak, chat hari ini sudah cukup banyak. Admin akan menghubungi kakak ya 🙏");
    return;
  }

  const ctx = await resolveContext(waId, value?.contacts?.[0]?.profile?.name);

  // 5. A human is handling this chat — stay quiet.
  if (ctx.handoff) {
    await saveMessage(ctx, MessageRole.USER, text, { waMessageId: message.id });
    return;
  }

  await saveMessage(ctx, MessageRole.USER, text, { waMessageId: message.id });

  // 6. Obvious prompt injection never reaches the model.
  if (looksLikeInjection(text)) {
    log.warn("injection attempt blocked", { contactId: ctx.contactId });
    await prisma.auditLog.create({
      data: { actor: "bot", action: "blocked:injection", contactId: ctx.contactId },
    });

    // Repeat offenders are muted for a day, and the owner is told.
    const strikes = await prisma.auditLog.count({
      where: {
        contactId: ctx.contactId,
        action: "blocked:injection",
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (strikes >= INJECTION_STRIKES) {
      await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { blockedUntil: new Date(Date.now() + 86_400_000) },
      });
      await saveMessage(ctx, MessageRole.ASSISTANT, BLOCKED_REPLY);
      // Owner first: a failed send to the abuser must not swallow the alert.
      await notifyOwner({
        dedupeKey: `blocked:${ctx.contactId}:${new Date().toISOString().slice(0, 10)}`,
        title: "Nomor dijeda otomatis",
        subject: `Chat dijeda 24 jam: ${ctx.name ?? maskPhone(ctx.phoneE164)}`,
        body: `Nomor ${ctx.phoneE164} mencoba memanipulasi asisten ${strikes} kali dalam 24 jam, jadi chatnya dijeda 24 jam.\n\nKalau ini salah paham, kosongkan blockedUntil untuk kontak ini.`,
        short: `Nomor ${maskPhone(ctx.phoneE164)} dijeda 24 jam karena mencoba memanipulasi asisten.`,
      });
      await sendText(waId, BLOCKED_REPLY);
      return;
    }

    await saveMessage(ctx, MessageRole.ASSISTANT, OFF_TOPIC_REPLY);
    await sendText(waId, OFF_TOPIC_REPLY);
    return;
  }

  try {
    const result = await runAssistant(ctx);
    const guarded = guardReply(stripLog(result.text), env().APP_URL);
    if (guarded.flagged.length) log.warn("reply filtered", { contactId: ctx.contactId, flagged: guarded.flagged });
    await sendText(waId, guarded.text);
    await prisma.auditLog.create({
      data: {
        actor: "bot",
        action: "reply",
        contactId: ctx.contactId,
        tenantId: ctx.tenantId,
        meta: {
          tools: result.toolLog.map((t) => t.tool),
          tokens: result.usage,
          costUsd: Number(estimateCostUsd(result.usage).toFixed(5)),
          ...(guarded.flagged.length ? { filtered: guarded.flagged } : {}),
        } as never,
      },
    });
  } catch (error) {
    log.error("assistant failed", { message: String(error) });
    await sendText(waId, "Maaf kak, sistemnya lagi bermasalah sebentar. Coba kirim ulang pesannya ya 🙏");
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
