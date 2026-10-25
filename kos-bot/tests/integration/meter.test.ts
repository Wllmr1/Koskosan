import { InvoiceKind, LeaseStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { billOverage, meterSheet, saveMeterReadings } from "@/lib/meter";
import { makeRoom, uniq } from "../helpers";

const PERIOD = new Date(Date.UTC(2026, 8, 1)); // September 2026
let roomOver = "";
let roomUnder = "";
let tenantOver = "";

beforeAll(async () => {
  for (const [used, keep] of [[118, "over"], [60, "under"]] as const) {
    const id = uniq();
    const room = await makeRoom({ status: "OCCUPIED", type: { monthlyPrice: 1_350_000 } });
    const tenant = await prisma.tenant.create({
      data: { accountCode: `WA-M${id}`, fullName: "Penghuni Meter", phoneE164: `+62821${id}`, dateOfBirth: new Date("2003-01-01"), idNumberEnc: encrypt(`3208000${id}`), idLast4: id.slice(-4) },
    });
    await prisma.lease.create({
      data: { tenantId: tenant.id, roomId: room.id, plan: "MONTHLY", monthlyRent: 1_350_000, deposit: 1_350_000, startDate: new Date("2026-01-01"), endDate: new Date("2027-01-01"), status: LeaseStatus.ACTIVE },
    });
    if (keep === "over") { roomOver = room.id; tenantOver = tenant.id; } else roomUnder = room.id;
    await saveMeterReadings(PERIOD, [{ roomId: room.id, usedKwh: used }]);
  }
});

afterAll(() => prisma.$disconnect());

describe("meter readings and over-limit bills", () => {
  it("the sheet lists rooms with an active renter and their saved reading", async () => {
    const sheet = await meterSheet(PERIOD);
    const over = sheet.find((r) => r.roomId === roomOver)!;
    expect(over).toMatchObject({ usedKwh: 118, quotaKwh: 100, overKwh: 18, extraCharge: 30_600, billed: false });
  });

  it("bills only rooms over the quota, once, and tells the renter", async () => {
    const first = await billOverage(PERIOD, "owner");
    expect(first.created).toBeGreaterThanOrEqual(1);
    const bills = await prisma.invoice.findMany({ where: { lease: { roomId: { in: [roomOver, roomUnder] } }, kind: InvoiceKind.UTILITY_OVERAGE } });
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ amount: 30_600 });
    expect(bills[0].description).toMatch(/September 2026.*18 kWh/);

    await billOverage(PERIOD, "owner");
    expect(await prisma.invoice.count({ where: { lease: { roomId: roomOver }, kind: InvoiceKind.UTILITY_OVERAGE } })).toBe(1);

    const note = await prisma.message.findFirst({ where: { conversation: { contact: { webSessionId: `renter:${tenantOver}` } } } });
    expect(note?.content).toMatch(/kelebihan listrik/i);
    expect((await meterSheet(PERIOD)).find((r) => r.roomId === roomOver)?.billed).toBe(true);
  });

  it("refuses negative or absurd readings", async () => {
    await expect(saveMeterReadings(PERIOD, [{ roomId: roomOver, usedKwh: -5 }])).rejects.toThrow();
    await expect(saveMeterReadings(PERIOD, [{ roomId: roomOver, usedKwh: 100_000 }])).rejects.toThrow();
  });
});
