import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sha256, signSession } from "@/lib/crypto";
import { ApplicationError, createApplication } from "@/lib/application";
import { resolveWebContext } from "@/lib/chat/context";
import { POST as startOnline } from "@/app/api/apply/start/route";
import { makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

async function room(status: RoomStatus = RoomStatus.AVAILABLE, hidden = false) {
  return makeRoom({ status, hidden });
}

describe("createApplication (shared by the bot and the website)", () => {
  it("creates an application for an available room and returns its form token", async () => {
    const r = await room();
    const ctx = await resolveWebContext({ anonId: `anon-rent-${uniq()}`, tenantId: null });
    const out = await createApplication({ contactId: ctx.contactId, roomCode: r.code.toLowerCase(), months: 24 });

    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(out.token) } });
    expect(app.roomId).toBe(r.id);
    expect(app.contactId).toBe(ctx.contactId);
    expect(app.plan).toBe("MONTHLY");
    expect(app.termMonths).toBe(24);
    expect(app.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
    expect(out.reference).toBe(app.reference);
  });

  it("refuses a room that is not available", async () => {
    const r = await room(RoomStatus.OCCUPIED);
    await expect(createApplication({ contactId: null, roomCode: r.code, months: 12 })).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("treats hidden and unknown rooms as not found", async () => {
    const r = await room(RoomStatus.AVAILABLE, true);
    await expect(createApplication({ contactId: null, roomCode: r.code, months: 12 })).rejects.toBeInstanceOf(ApplicationError);
    await expect(createApplication({ contactId: null, roomCode: "NOPE-0", months: 12 })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("POST /api/apply/start (rent on the website)", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    startOnline(
      new NextRequest("http://localhost:3000/api/apply/start", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded", ...headers },
        body,
      })
    );

  it("goes straight to the secure form and starts an anonymous session", async () => {
    const r = await room();
    const res = await post(`room=${r.code}&months=12`, { "x-real-ip": `10.6.${uniq()}` });
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toMatch(/^\/apply\/[A-Za-z0-9_-]{20,}$/);
    expect(res.headers.get("set-cookie")).toMatch(/kos_chat=/);

    const app = await prisma.application.findUniqueOrThrow({
      where: { tokenHash: sha256(location.pathname.split("/").pop()!) },
      include: { contact: true },
    });
    expect(app.plan).toBe("MONTHLY");
    expect(app.termMonths).toBe(12);
    expect(app.contact?.webSessionId).toMatch(/^anon:/);
  });

  it("sends the visitor back to pick a contract length when none or an odd one is sent", async () => {
    const r = await room();
    for (const body of [`room=${r.code}`, `room=${r.code}&months=3`, `room=${r.code}&months=bulanan`]) {
      const res = await post(body, { "x-real-ip": `10.7.${uniq()}` });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`http://localhost:3000/kamar/${r.code}?sewa=lama`);
    }
    expect(await prisma.application.count({ where: { roomId: r.id } })).toBe(0);
  });

  it("reuses the visitor's existing chat session", async () => {
    const r = await room();
    const anonId = `anonrentexisting${uniq()}`;
    const res = await post(`room=${r.code}&months=24`, {
      "x-real-ip": `10.5.${uniq()}`,
      cookie: `kos_chat=${signSession(anonId, 60_000)}`,
    });
    const token = new URL(res.headers.get("location")!).pathname.split("/").pop()!;
    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(token) }, include: { contact: true } });
    expect(app.contact?.webSessionId).toBe(`anon:${anonId}`);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sends a visitor back to the room page when it was just taken", async () => {
    const r = await room(RoomStatus.BOOKED);
    const res = await post(`room=${r.code}&months=12`, { "x-real-ip": `10.4.${uniq()}` });
    expect(res.headers.get("location")).toBe(`http://localhost:3000/kamar/${r.code}?sewa=penuh`);
  });

  it("refuses posts from other websites", async () => {
    const r = await room();
    const res = await post(`room=${r.code}&months=12`, { origin: "https://evil.example", "x-real-ip": `10.3.${uniq()}` });
    expect(res.status).toBe(403);
  });

  it("allows at most 5 new applications per IP per hour", async () => {
    const r = await room();
    const ip = `10.2.${uniq()}`;
    const results: string[] = [];
    for (let i = 0; i < 6; i++) results.push((await post(`room=${r.code}&months=12`, { "x-real-ip": ip })).headers.get("location")!);
    expect(results.slice(0, 5).every((l) => l.includes("/apply/"))).toBe(true);
    expect(results[5]).toBe(`http://localhost:3000/kamar/${r.code}?sewa=batas`);
  });
});
