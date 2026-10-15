import { Channel, ContactType } from "@prisma/client";
import type { ChatCtx } from "@/lib/chat/context";

/** A chat context for tests. Defaults to an anonymous website visitor. */
export function makeCtx(over: Partial<ChatCtx> = {}): ChatCtx {
  return {
    contactId: "test-contact",
    conversationId: "test-conversation",
    channel: Channel.WEB,
    waId: null,
    phoneE164: null,
    name: null,
    type: ContactType.PROSPECT,
    tenantId: null,
    accountCode: null,
    roomCode: null,
    verified: false,
    handoff: false,
    blocked: false,
    actions: [],
    ...over,
  };
}

let counter = 0;
/**
 * Unique per test run and per call. The test database is never wiped, so
 * every unique column (codes, phones, ids) a test writes must come from here.
 */
export function uniq(): string {
  counter += 1;
  return `${Date.now().toString().slice(-7)}${String(counter).padStart(2, "0")}`;
}
