import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { clientIp } from "@/lib/http";
import { chatAllowance } from "@/lib/chat/allowance";
import { LIMITS } from "@/lib/rate-limit";
import { POST as login } from "@/app/api/auth/login/route";
import { uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

const req = (headers: Record<string, string>, body = "") =>
  new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });

describe("renter login lockout", () => {
  it("a burst of parallel wrong passwords cannot exceed 5 checked attempts", async () => {
    const id = uniq();
    const phone = `+62818${id}`;
    await prisma.tenant.create({
      data: {
        accountCode: `WA-L${id}`,
        fullName: "Target Login",
        phoneE164: phone,
        dateOfBirth: new Date("2003-01-01"),
        idNumberEnc: encrypt(`3206000${id}`),
        idLast4: id.slice(-4),
        passwordHash: await hashPassword("password-benar-123"),
      },
    });
    const body = `phone=${encodeURIComponent(phone)}&password=salah-salah-salah`;
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => login(req({ "x-real-ip": `10.9.${Number(id.slice(-3)) % 250}.${i}` }, body)))
    );
    const outcomes = responses.map((r) => new URL(r.headers.get("location")!).search);
    expect(outcomes.filter((o) => o === "?error=1").length).toBeLessThanOrEqual(5);
    expect(outcomes.filter((o) => o === "?locked=1").length).toBeGreaterThanOrEqual(5);
  });
});

describe("client IP", () => {
  it("prefers the proxy's X-Real-IP and otherwise the last X-Forwarded-For hop", () => {
    const r = (h: Record<string, string>) => new NextRequest("http://localhost:3000/x", { headers: h });
    expect(clientIp(r({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    // A visitor can put anything first in X-Forwarded-For; the proxy appends the real address last.
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(r({}))).toBe("0.0.0.0");
  });
});

describe("anonymous chat cost caps", () => {
  const bucket = Math.floor(Date.now() / LIMITS.chatIpPerDay.windowMs);

  it("an IP that used its daily allowance gets the day message, without a new cookie resetting it", async () => {
    const ip = `10.8.${uniq()}`;
    expect(await chatAllowance(ip)).toBe("ok");
    await prisma.rateCounter.update({
      where: { key: `chat-ip-day:${ip}:${bucket}` },
      data: { count: LIMITS.chatIpPerDay.limit },
    });
    expect(await chatAllowance(ip)).toBe("day");
  });

  it("the whole site stops calling Claude once the global daily cap is reached", async () => {
    const key = `chat-all-day:all:${bucket}`;
    const before = await prisma.rateCounter.findUnique({ where: { key } });
    await prisma.rateCounter.upsert({
      where: { key },
      create: { key, count: LIMITS.chatAllPerDay.limit, expiresAt: new Date(Date.now() + 2 * 86_400_000) },
      update: { count: LIMITS.chatAllPerDay.limit },
    });
    try {
      expect(await chatAllowance(`10.7.${uniq()}`)).toBe("day");
    } finally {
      if (before) await prisma.rateCounter.update({ where: { key }, data: { count: before.count } });
      else await prisma.rateCounter.delete({ where: { key } });
    }
  });
});
