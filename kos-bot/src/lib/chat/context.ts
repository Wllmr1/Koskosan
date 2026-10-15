import { Channel, ContactType, MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChatAction } from "./actions";

const DAY_MS = 86_400_000;

/** Non-renters are forgotten entirely 24 hours after their last message. */
export const PROSPECT_TTL_MS = DAY_MS;
/** Renters keep 90 days of chat. Their account data is never touched by the purge. */
export const MEMBER_TTL_MS = 90 * DAY_MS;

const HISTORY_LIMIT = 20;

/**
 * Everything the assistant is allowed to know about who is texting.
 * Built by the server from the phone number. The model never supplies it,
 * so a prompt injection cannot make the bot read someone else's account.
 */
export type ChatCtx = {
  contactId: string;
  conversationId: string;
  channel: Channel;
  /** WhatsApp only */
  waId: string | null;
  /** WhatsApp number, or the renter's phone on the website; null for anonymous visitors */
  phoneE164: string | null;
  name: string | null;
  type: ContactType;
  tenantId: string | null;
  accountCode: string | null;
  roomCode: string | null;
  verified: boolean;
  handoff: boolean;
  /** muted for repeated abuse — the bot ignores this contact until then */
  blocked: boolean;
  /** buttons the tools attached during this turn */
  actions: ChatAction[];
};

/** Called for every inbound message. Creates or refreshes the Contact. */
export async function resolveWhatsAppContext(waId: string, profileName?: string): Promise<ChatCtx> {
  const digits = waId.replace(/\D/g, "");
  const phoneE164 = "+" + digits;
  const now = new Date();

  const tenant = await prisma.tenant.findUnique({
    where: { phoneE164 },
    include: {
      leases: {
        where: { status: "ACTIVE" },
        include: { room: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const isMember = !!tenant && tenant.leases.length > 0;
  const type: ContactType = isMember ? ContactType.MEMBER : ContactType.PROSPECT;

  const contact = await prisma.contact.upsert({
    where: { waId: digits },
    create: {
      channel: Channel.WHATSAPP,
      waId: digits,
      phoneE164,
      displayName: tenant?.fullName ?? sanitizeName(profileName) ?? null,
      type,
      tenantId: isMember ? tenant.id : null,
      lastMessageAt: now,
      expiresAt: isMember ? null : new Date(now.getTime() + PROSPECT_TTL_MS),
    },
    update: {
      lastMessageAt: now,
      type,
      tenantId: isMember ? tenant.id : null,
      // sliding window: a prospect's memory expires 24h after their LAST message
      expiresAt: isMember ? null : new Date(now.getTime() + PROSPECT_TTL_MS),
      ...(isMember && tenant ? { displayName: tenant.fullName } : {}),
    },
  });

  const conversation = await currentConversation(contact.id, type);

  // A matching phone number is not proof of identity. Account data stays locked
  // until the person opens the one-time verification link.
  const verified = isMember && !!contact.verifiedAt;

  return {
    contactId: contact.id,
    conversationId: conversation.id,
    channel: Channel.WHATSAPP,
    waId: digits,
    phoneE164,
    name: contact.displayName,
    type,
    tenantId: verified && tenant ? tenant.id : null,
    accountCode: verified && tenant ? tenant.accountCode : null,
    roomCode: verified && tenant ? (tenant.leases[0]?.room.code ?? null) : null,
    verified,
    handoff: !!contact.handoffUntil && contact.handoffUntil > now,
    blocked: !!contact.blockedUntil && contact.blockedUntil > now,
    actions: [],
  };
}

export const webAnonKey = (anonId: string) => `anon:${anonId}`;
export const webRenterKey = (tenantId: string) => `renter:${tenantId}`;

const isBlocked = (c: { blockedUntil: Date | null }, now: Date) => !!c.blockedUntil && c.blockedUntil > now;

async function activeTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        where: { status: "ACTIVE" },
        include: { room: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return tenant && tenant.leases.length ? { tenant, lease: tenant.leases[0] } : null;
}

/**
 * Website visitor. A logged-in renter with an active lease gets their own
 * member conversation (shared across their devices). Everyone else — including
 * a renter whose lease has ended — is an anonymous prospect, forgotten 24 hours
 * after their last message.
 */
export async function resolveWebContext(opts: { anonId: string; tenantId: string | null }): Promise<ChatCtx> {
  const now = new Date();

  const renter = opts.tenantId ? await activeTenant(opts.tenantId) : null;
  if (renter) {
    const { tenant, lease } = renter;
    const key = webRenterKey(tenant.id);
    const contact = await prisma.contact.upsert({
      where: { webSessionId: key },
      create: {
        channel: Channel.WEB,
        webSessionId: key,
        displayName: tenant.fullName,
        type: ContactType.MEMBER,
        tenantId: tenant.id,
        verifiedAt: now,
        lastMessageAt: now,
        expiresAt: null,
      },
      update: { lastMessageAt: now, displayName: tenant.fullName, type: ContactType.MEMBER, tenantId: tenant.id, expiresAt: null },
    });
    const conversation = await currentConversation(contact.id, ContactType.MEMBER);
    return {
      contactId: contact.id,
      conversationId: conversation.id,
      channel: Channel.WEB,
      waId: null,
      phoneE164: tenant.phoneE164,
      name: tenant.fullName,
      type: ContactType.MEMBER,
      tenantId: tenant.id,
      accountCode: tenant.accountCode,
      roomCode: lease.room.code,
      verified: true,
      handoff: false,
      blocked: isBlocked(contact, now),
      actions: [],
    };
  }

  const key = webAnonKey(opts.anonId);
  const expiresAt = new Date(now.getTime() + PROSPECT_TTL_MS);
  const contact = await prisma.contact.upsert({
    where: { webSessionId: key },
    create: { channel: Channel.WEB, webSessionId: key, type: ContactType.PROSPECT, lastMessageAt: now, expiresAt },
    update: { lastMessageAt: now, expiresAt },
  });
  const conversation = await currentConversation(contact.id, ContactType.PROSPECT);
  return {
    contactId: contact.id,
    conversationId: conversation.id,
    channel: Channel.WEB,
    waId: null,
    phoneE164: null,
    name: contact.displayName,
    type: ContactType.PROSPECT,
    tenantId: null,
    accountCode: null,
    roomCode: null,
    verified: false,
    handoff: false,
    blocked: isBlocked(contact, now),
    actions: [],
  };
}

/** Which web contact's history to show, without creating anything. */
export async function findWebContactId(opts: { anonId: string | null; tenantId: string | null }): Promise<string | null> {
  if (opts.tenantId && (await activeTenant(opts.tenantId))) {
    const c = await prisma.contact.findUnique({ where: { webSessionId: webRenterKey(opts.tenantId) }, select: { id: true } });
    return c?.id ?? null;
  }
  if (!opts.anonId) return null;
  const c = await prisma.contact.findUnique({ where: { webSessionId: webAnonKey(opts.anonId) }, select: { id: true } });
  return c?.id ?? null;
}

export async function currentConversation(contactId: string, type: ContactType) {
  const since = new Date(Date.now() - (type === ContactType.PROSPECT ? PROSPECT_TTL_MS : DAY_MS));
  const existing = await prisma.conversation.findFirst({
    where: { contactId, messages: { some: { createdAt: { gte: since } } } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return existing ?? (await prisma.conversation.create({ data: { contactId }, select: { id: true } }));
}

export type Turn = { role: "user" | "assistant"; content: string };

/** Recent turns, already trimmed to what the Claude API accepts. */
export async function loadHistory(ctx: ChatCtx): Promise<Turn[]> {
  // The hard floor matters: even if the purge job is late, a prospect's
  // history older than 24h is never fed back into the prompt.
  const floor =
    ctx.type === ContactType.PROSPECT ? new Date(Date.now() - PROSPECT_TTL_MS) : new Date(Date.now() - MEMBER_TTL_MS);

  const rows = await prisma.message.findMany({
    where: { conversation: { contactId: ctx.contactId }, createdAt: { gte: floor } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });

  const turns: Turn[] = rows
    .reverse()
    .map((m) => ({ role: m.role === MessageRole.USER ? ("user" as const) : ("assistant" as const), content: m.content }))
    .filter((t) => t.content.trim().length > 0);

  // The API requires the first turn to be from the user.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export async function saveMessage(
  ctx: ChatCtx,
  role: MessageRole,
  content: string,
  extra: { waMessageId?: string; toolLog?: unknown; actions?: ChatAction[] } = {}
) {
  const ttl = ctx.type === ContactType.PROSPECT ? PROSPECT_TTL_MS : MEMBER_TTL_MS;
  return prisma.message.create({
    data: {
      conversationId: ctx.conversationId,
      role,
      content: content.slice(0, 4000),
      waMessageId: extra.waMessageId,
      toolLog: (extra.toolLog ?? undefined) as never,
      actions: extra.actions?.length ? (extra.actions as never) : undefined,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
}

/**
 * The only per-person text in the system prompt: names and codes.
 * Balances and quotas are deliberately absent — tools fetch them live so the
 * numbers are never stale and never cached across turns.
 */
export function identityHeader(ctx: ChatCtx): string {
  if (ctx.type === ContactType.MEMBER && ctx.verified) {
    return [
      ctx.channel === Channel.WEB ? "They are chatting on the website." : "They are chatting on WhatsApp.",
      `The person is a VERIFIED RENTER.`,
      `Name: ${ctx.name}.`,
      `Account ID: ${ctx.accountCode}.`,
      `Room: ${ctx.roomCode}.`,
      `You may use the renter tools for them.`,
    ].join(" ");
  }
  if (ctx.type === ContactType.MEMBER) {
    return [
      ctx.channel === Channel.WEB ? "They are chatting on the website." : "They are chatting on WhatsApp.",
      `This number is registered to a renter but is NOT verified in this session.`,
      `Share no account data at all.`,
      `If they ask about rent, bills, utilities or guests, call send_verification_link and tell them to tap it.`,
    ].join(" ");
  }
  return [
    ctx.channel === Channel.WEB ? "They are chatting on the website." : "They are chatting on WhatsApp.",
    `The person is a PROSPECT (not a renter).`,
    ctx.name ? `Name: ${ctx.name}.` : `You do not know their name yet — ask once, politely, then call remember_name.`,
    `They have no account, so never imply they owe anything.`,
  ].join(" ");
}

function sanitizeName(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[^\p{L}\p{M}\s'.-]/gu, "").trim().slice(0, 60);
  return clean.length >= 2 ? clean : null;
}

/** Called after a contract is signed and the first payment lands. */
export async function promoteToMember(contactId: string, tenantId: string) {
  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contactId },
      data: { type: ContactType.MEMBER, tenantId, expiresAt: null, verifiedAt: new Date() },
    }),
    // keep the conversation that led to the signing, on the member retention period
    prisma.message.updateMany({
      where: { conversation: { contactId } },
      data: { expiresAt: new Date(Date.now() + MEMBER_TTL_MS) },
    }),
  ]);
}

/** Puts the bot to sleep for this contact so a person can reply instead. */
export async function startHandoff(contactId: string, hours = 12) {
  await prisma.contact.update({
    where: { id: contactId },
    data: { handoffUntil: new Date(Date.now() + hours * 3_600_000) },
  });
}

export async function endHandoff(contactId: string) {
  await prisma.contact.update({ where: { id: contactId }, data: { handoffUntil: null } });
}
