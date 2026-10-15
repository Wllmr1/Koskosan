import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

afterAll(() => prisma.$disconnect());

describe("schema", () => {
  it("has the new property settings with defaults", async () => {
    const s = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    expect(s.depositMonths).toBe(1);
    expect(s.depositReturnDays).toBe(14);
    expect(s.maxGuestNights).toBe(3);
    expect(s.maxGuestsAtOnce).toBe(2);
    expect(s.utilitiesNote).toMatch(/wifi/i);
  });

  it("stores a web contact without a phone number", async () => {
    const c = await prisma.contact.create({ data: { channel: "WEB", webSessionId: `anon:schema-${Date.now()}` } });
    expect(c.waId).toBeNull();
    expect(c.channel).toBe("WEB");
  });
});
