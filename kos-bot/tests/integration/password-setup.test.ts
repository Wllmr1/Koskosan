import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { verifyPassword } from "@/lib/password";
import { consumePasswordSetup, createPasswordSetupLink } from "@/lib/password-setup";
import { uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

async function tenant() {
  const id = uniq();
  return prisma.tenant.create({
    data: {
      accountCode: `WA-S${id}`,
      fullName: `Dewi Set${id}`,
      phoneE164: `+62814${id}`,
      dateOfBirth: new Date("2003-01-01"),
      idNumberEnc: encrypt(`3202000${id}`),
      idLast4: id.slice(-4),
    },
  });
}

const tokenOf = (url: string) => url.split("/atur-password/")[1];

describe("password setup links", () => {
  it("sets the password once and logs out old sessions", async () => {
    const t = await tenant();
    const url = await createPasswordSetupLink(t.id);
    expect(url).toMatch(/^http:\/\/localhost:3000\/atur-password\/[A-Za-z0-9_-]{20,}$/);

    expect(await consumePasswordSetup(tokenOf(url), "pendek", "pendek")).toMatchObject({ ok: false });
    expect(await consumePasswordSetup(tokenOf(url), "password-baru-123", "password-baru-123")).toEqual({ ok: true });

    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } });
    expect(await verifyPassword("password-baru-123", after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(t.sessionVersion + 1);

    expect(await consumePasswordSetup(tokenOf(url), "password-lain-456", "password-lain-456")).toMatchObject({ ok: false });
  });

  it("a newer link does not revive an older one, and expired links fail", async () => {
    const t = await tenant();
    const first = await createPasswordSetupLink(t.id);
    const second = await createPasswordSetupLink(t.id);
    expect(await consumePasswordSetup(tokenOf(second), "password-baru-123", "password-baru-123")).toEqual({ ok: true });
    expect(await consumePasswordSetup(tokenOf(first), "password-baru-456", "password-baru-456")).toMatchObject({ ok: false });

    const third = await createPasswordSetupLink(t.id);
    await prisma.passwordSetupToken.updateMany({ where: { tenantId: t.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumePasswordSetup(tokenOf(third), "password-baru-789", "password-baru-789")).toMatchObject({ ok: false });
  });
});
