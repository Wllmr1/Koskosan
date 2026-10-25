import { ContactType, LeasePlan, LeaseStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { TOOLS } from "@/lib/chat/tools";
import { makeCtx, uniq } from "../helpers";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const register = TOOLS.find((t) => t.name === "register_guest")!;
let ctx: ReturnType<typeof makeCtx>;

beforeAll(async () => {
  const id = uniq();
  const room = await prisma.room.findFirstOrThrow({ where: { code: "A-103" }, include: { roomType: true } });
  const tenant = await prisma.tenant.create({
    data: {
      accountCode: `WA-G${id}`,
      fullName: "Penghuni Tamu",
      phoneE164: `+62811${id}`,
      dateOfBirth: new Date("2003-01-01"),
      idNumberEnc: encrypt("3201000000000101"),
      idLast4: "0101",
    },
  });
  await prisma.lease.create({
    data: {
      tenantId: tenant.id,
      roomId: room.id,
      plan: LeasePlan.MONTHLY,
      monthlyRent: room.roomType.monthlyPrice,
      deposit: room.roomType.monthlyPrice,
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 86_400_000),
      status: LeaseStatus.ACTIVE,
    },
  });
  const contact = await prisma.contact.create({
    data: { channel: "WEB", webSessionId: `renter:${tenant.id}`, type: ContactType.MEMBER, tenantId: tenant.id },
  });
  ctx = makeCtx({
    contactId: contact.id,
    type: ContactType.MEMBER,
    verified: true,
    tenantId: tenant.id,
    accountCode: tenant.accountCode,
    roomCode: room.code,
    name: tenant.fullName,
  });

  // Already registered: day 10 for 3 nights, day 11 for 1 night → night 11 has 2 guests.
  for (const [n, nights] of [[10, 3], [11, 1]] as const) {
    await prisma.guestStay.create({
      data: {
        code: `GST-T${uniq()}`,
        tenantId: tenant.id,
        guestName: "Tamu Lama",
        phoneE164: "+6280000000102",
        idNumberEnc: encrypt("3201000000000102"),
        idLast4: "0102",
        checkIn: new Date(`${day(n)}T00:00:00Z`),
        nights,
        fee: 50_000 * nights,
      },
    });
  }
});

afterAll(() => prisma.$disconnect());

const attempt = async (n: number, nights: number) => {
  ctx.actions = [];
  try {
    await register.run(
      { guest_name: "Tamu Baru", guest_phone: "081200000103", guest_id_number: "3201000000000103", check_in: day(n), nights },
      ctx
    );
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("register_guest overlap rule", () => {
  it("refuses a third guest on a full night", async () => {
    expect(await attempt(11, 1)).toMatch(/maximum/);
  });

  it("allows an earlier stay that does not overlap", async () => {
    expect(await attempt(5, 1)).toBe("ok");
    expect(ctx.actions[0]).toMatchObject({ label: "Bayar biaya tamu" });
    expect(ctx.actions[0].path).toMatch(/^\/p\/INV-GUEST-/);
  });

  it("allows a stay after the others end", async () => {
    expect(await attempt(13, 1)).toBe("ok");
  });
});
