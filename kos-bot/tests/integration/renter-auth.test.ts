import { ContactType, LeasePlan, LeaseStatus, RoomStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { renterCookieValue, renterFromCookie } from "@/lib/renter-auth";
import { findWebContactId, resolveWebContext } from "@/lib/chat/context";
import { makeRoom, uniq } from "../helpers";

let activeId = "";
let endedId = "";
let roomCode = "";

async function tenantWithLease(status: LeaseStatus) {
  const id = uniq();
  const room = await makeRoom({ status: status === LeaseStatus.ACTIVE ? RoomStatus.OCCUPIED : RoomStatus.AVAILABLE });
  if (status === LeaseStatus.ACTIVE) roomCode = room.code;
  const tenant = await prisma.tenant.create({
    data: {
      accountCode: `WA-A${id}`,
      fullName: `Rina Auth${id}`,
      phoneE164: `+62813${id}`,
      dateOfBirth: new Date("2003-01-01"),
      idNumberEnc: encrypt(`3201000${id}`),
      idLast4: id.slice(-4),
    },
  });
  await prisma.lease.create({
    data: {
      tenantId: tenant.id,
      roomId: room.id,
      plan: LeasePlan.MONTHLY,
      monthlyRent: room.roomType.monthlyPrice,
      deposit: room.roomType.monthlyPrice,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      status,
    },
  });
  return tenant.id;
}

beforeAll(async () => {
  activeId = await tenantWithLease(LeaseStatus.ACTIVE);
  endedId = await tenantWithLease(LeaseStatus.ENDED);
});
afterAll(() => prisma.$disconnect());

describe("renter session cookie", () => {
  it("is valid until the session version changes", async () => {
    const cookie = renterCookieValue(activeId, 0);
    expect((await renterFromCookie(cookie))?.id).toBe(activeId);

    await prisma.tenant.update({ where: { id: activeId }, data: { sessionVersion: { increment: 1 } } });
    expect(await renterFromCookie(cookie)).toBeNull();
    expect((await renterFromCookie(renterCookieValue(activeId, 1)))?.id).toBe(activeId);
  });

  it("rejects a tampered cookie", async () => {
    const [, exp, mac] = renterCookieValue(activeId, 1).split(".");
    expect(await renterFromCookie(`${endedId}:0.${exp}.${mac}`)).toBeNull();
  });
});

describe("website chat identity", () => {
  it("a renter with an active lease gets renter mode", async () => {
    const ctx = await resolveWebContext({ anonId: `anon-auth-${uniq()}`, tenantId: activeId });
    expect(ctx.type).toBe(ContactType.MEMBER);
    expect(ctx.verified).toBe(true);
    expect(ctx.roomCode).toBe(roomCode);
  });

  it("a renter whose lease ended is treated as a visitor", async () => {
    const ctx = await resolveWebContext({ anonId: `anon-auth-${uniq()}`, tenantId: endedId });
    expect(ctx.type).toBe(ContactType.PROSPECT);
    expect(ctx.verified).toBe(false);
    expect(ctx.tenantId).toBeNull();
  });

  it("after logout the same browser sees only its anonymous chat", async () => {
    const anonId = `anon-auth-${uniq()}`;
    const renterCtx = await resolveWebContext({ anonId, tenantId: activeId });
    const anonCtx = await resolveWebContext({ anonId, tenantId: null });
    expect(await findWebContactId({ anonId, tenantId: activeId })).toBe(renterCtx.contactId);
    expect(await findWebContactId({ anonId, tenantId: null })).toBe(anonCtx.contactId);
    expect(anonCtx.contactId).not.toBe(renterCtx.contactId);
  });
});
