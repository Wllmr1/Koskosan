import { Channel, MessageRole } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { maskPhone } from "@/lib/crypto";
import { notifyOwner } from "@/lib/notify";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import type { ChatAction } from "./actions";
import { estimateCostUsd, runAssistant, withLog } from "./assistant";
import { saveMessage, type ChatCtx } from "./context";
import { BLOCKED_REPLY, guardReply, INJECTION_STRIKES, looksLikeInjection, OFF_TOPIC_REPLY } from "./rules";

export const RATE_REPLY_MINUTE = "Pelan-pelan ya kak 🙏 Tunggu sebentar lalu kirim lagi.";
export const RATE_REPLY_DAY = "Maaf kak, chat hari ini sudah cukup banyak. Admin akan menghubungi kakak ya 🙏";
export const ERROR_REPLY = "Maaf kak, sistemnya lagi bermasalah sebentar. Coba kirim ulang pesannya ya 🙏";

export type Reply = { text: string; actions: ChatAction[] };

/**
 * One inbound message, any channel: limits → save → injection filter →
 * assistant → output filter → save. Returns what to send, or null to stay silent.
 */
export async function handleInbound(ctx: ChatCtx, text: string, opts: { waMessageId?: string } = {}): Promise<Reply | null> {
  if (ctx.blocked) return null;

  // Cheap abuse limits before a single token is spent.
  if (await overLimit("chat-min", ctx.contactId, LIMITS.waPerMinute.limit, LIMITS.waPerMinute.windowMs)) {
    return ctx.channel === Channel.WEB ? { text: RATE_REPLY_MINUTE, actions: [] } : null;
  }
  if (await overLimit("chat-day", ctx.contactId, LIMITS.waPerDay.limit, LIMITS.waPerDay.windowMs)) {
    return { text: RATE_REPLY_DAY, actions: [] };
  }

  await saveMessage(ctx, MessageRole.USER, text, { waMessageId: opts.waMessageId });

  // A human is handling this WhatsApp chat — stay quiet.
  if (ctx.handoff && ctx.channel === Channel.WHATSAPP) return null;

  if (looksLikeInjection(text)) return refuseInjection(ctx);

  try {
    const result = await runAssistant(ctx);
    const guarded = guardReply(result.text, env().APP_URL);
    if (guarded.flagged.length) log.warn("reply filtered", { contactId: ctx.contactId, flagged: guarded.flagged });

    await saveMessage(ctx, MessageRole.ASSISTANT, withLog(guarded.text, result.toolLog), {
      toolLog: result.toolLog,
      actions: result.actions,
    });
    await prisma.auditLog.create({
      data: {
        actor: "bot",
        action: "reply",
        contactId: ctx.contactId,
        tenantId: ctx.tenantId,
        meta: {
          channel: ctx.channel,
          tools: result.toolLog.map((t) => t.tool),
          tokens: result.usage,
          costUsd: Number(estimateCostUsd(result.usage).toFixed(5)),
          ...(guarded.flagged.length ? { filtered: guarded.flagged } : {}),
        } as never,
      },
    });
    return { text: guarded.text, actions: result.actions };
  } catch (error) {
    log.error("assistant failed", { message: String(error) });
    return { text: ERROR_REPLY, actions: [] };
  }
}

/** Obvious prompt injection never reaches the model. Repeat offenders are muted for a day. */
async function refuseInjection(ctx: ChatCtx): Promise<Reply> {
  log.warn("injection attempt blocked", { contactId: ctx.contactId });
  await prisma.auditLog.create({ data: { actor: "bot", action: "blocked:injection", contactId: ctx.contactId } });

  const strikes = await prisma.auditLog.count({
    where: {
      contactId: ctx.contactId,
      action: "blocked:injection",
      createdAt: { gte: new Date(Date.now() - 86_400_000) },
    },
  });

  if (strikes < INJECTION_STRIKES) {
    await saveMessage(ctx, MessageRole.ASSISTANT, OFF_TOPIC_REPLY);
    return { text: OFF_TOPIC_REPLY, actions: [] };
  }

  await prisma.contact.update({
    where: { id: ctx.contactId },
    data: { blockedUntil: new Date(Date.now() + 86_400_000) },
  });
  await saveMessage(ctx, MessageRole.ASSISTANT, BLOCKED_REPLY);
  const who = ctx.phoneE164 ? maskPhone(ctx.phoneE164) : "pengunjung situs (anonim)";
  await notifyOwner({
    dedupeKey: `blocked:${ctx.contactId}:${new Date().toISOString().slice(0, 10)}`,
    title: "Nomor dijeda otomatis",
    subject: `Chat dijeda 24 jam: ${ctx.name ?? who}`,
    body: `${ctx.phoneE164 ?? "Pengunjung situs (anonim)"} mencoba memanipulasi asisten ${strikes} kali dalam 24 jam, jadi chatnya dijeda 24 jam.\n\nKalau ini salah paham, kosongkan blockedUntil untuk kontak ini.`,
    short: `${who} dijeda 24 jam karena mencoba memanipulasi asisten.`,
  });
  return { text: BLOCKED_REPLY, actions: [] };
}
