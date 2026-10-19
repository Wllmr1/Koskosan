import { Channel, ContactType, MessageRole } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { whatsappEnabled } from "@/lib/features";
import { sendCtaUrl, sendText } from "@/lib/whatsapp";
import type { ChatAction } from "./actions";
import { currentConversation, MEMBER_TTL_MS, PROSPECT_TTL_MS, webRenterKey } from "./context";

/**
 * Puts a message from the kos into a contact's chat, as if the assistant said
 * it: it is waiting when they open the website chat, and it is also sent on
 * WhatsApp when that contact is a WhatsApp contact and WhatsApp is set up.
 */
export async function deliverToContact(contactId: string, text: string, actions: ChatAction[] = []): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;

  const conversation = await currentConversation(contact.id, contact.type);
  const ttl = contact.type === ContactType.PROSPECT ? PROSPECT_TTL_MS : MEMBER_TTL_MS;
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content: text.slice(0, 4000),
      actions: actions.length ? (actions as never) : undefined,
      expiresAt: new Date(Date.now() + ttl),
    },
  });

  if (contact.channel === Channel.WHATSAPP && contact.waId && whatsappEnabled()) {
    await sendText(contact.waId, text).catch(() => undefined);
    for (const a of actions) {
      await sendCtaUrl(contact.waId, a.label, a.label, `${env().APP_URL}${a.path}`).catch(() => undefined);
    }
  }
}

/** Every chat a renter has: their website chat (created if needed) and any WhatsApp contact. */
export async function deliverToRenter(tenantId: string, text: string, actions: ChatAction[] = []): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const key = webRenterKey(tenantId);
  const web = await prisma.contact.upsert({
    where: { webSessionId: key },
    create: {
      channel: Channel.WEB,
      webSessionId: key,
      displayName: tenant.fullName,
      type: ContactType.MEMBER,
      tenantId,
      verifiedAt: new Date(),
      expiresAt: null,
    },
    update: {},
  });
  const whatsapp = await prisma.contact.findMany({ where: { tenantId, channel: Channel.WHATSAPP }, select: { id: true } });

  for (const c of [web, ...whatsapp]) await deliverToContact(c.id, text, actions);
}
