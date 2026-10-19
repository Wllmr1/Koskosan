import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseActions, type ChatAction } from "./actions";
import { stripLog } from "./assistant";

export type ChatLine = { role: "user" | "assistant"; text: string; actions: ChatAction[] };

/** What the website chat shows when it opens: the latest 50 messages still within retention. */
export async function webTranscript(contactId: string): Promise<ChatLine[]> {
  const now = new Date();
  const rows = await prisma.message.findMany({
    where: { conversation: { contactId }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    // id breaks ties: messages saved in the same millisecond keep their order (cuids increase).
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { role: true, content: true, actions: true },
  });
  return rows.reverse().map((m) =>
    m.role === MessageRole.USER
      ? { role: "user" as const, text: m.content, actions: [] }
      : { role: "assistant" as const, text: stripLog(m.content), actions: parseActions(m.actions) }
  );
}
