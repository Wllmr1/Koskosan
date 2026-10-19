import { MessageRole } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveWebContext, saveMessage } from "@/lib/chat/context";
import { webTranscript } from "@/lib/chat/transcript";
import { uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

describe("webTranscript", () => {
  it("returns the chat oldest first, without tool traces, with buttons", async () => {
    const ctx = await resolveWebContext({ anonId: `anon-transcript-${uniq()}`, tenantId: null });
    await saveMessage(ctx, MessageRole.USER, "Ada kamar kosong?");
    await saveMessage(ctx, MessageRole.ASSISTANT, "Ada kak, A-101.\n[log: search_rooms]", {
      actions: [{ kind: "link", label: "Foto A-101", path: "/kamar/A-101" }],
    });

    const lines = await webTranscript(ctx.contactId);
    expect(lines).toEqual([
      { role: "user", text: "Ada kamar kosong?", actions: [] },
      { role: "assistant", text: "Ada kak, A-101.", actions: [{ kind: "link", label: "Foto A-101", path: "/kamar/A-101" }] },
    ]);
  });

  it("hides expired messages", async () => {
    const ctx = await resolveWebContext({ anonId: `anon-transcript-${uniq()}`, tenantId: null });
    const old = await saveMessage(ctx, MessageRole.USER, "lama");
    await prisma.message.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await webTranscript(ctx.contactId)).toEqual([]);
  });
});
