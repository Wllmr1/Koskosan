import { InvoiceKind, LeaseStatus, RoomStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { runRentCycle } from "@/lib/jobs";
import { billOverage, meterSheet, saveMeterReadings } from "@/lib/meter";
import { firstOfMonth } from "@/lib/money";
import { loadRenterAccount } from "@/lib/renter-account";
import { makeRoom, uniq } from "../helpers";

/**
 * An occupied room whose current renter stays until the end of February 2027,
 * and a renter who booked it in advance from March 2027. Until March only the
 * current renter is billed rent or electricity, and the future renter sees
 * none of the room's meter data.
 */
const JAN = new Date(Date.UTC(2027, 0, 1));
const MAR = new Date(Date.UTC(2027, 2, 1));
let roomId = "";
let roomCode = "";
let currentLease = "";
let futureLease = "";
let futureTenant = "";
let currentTenant = "";

async function renter(start: Date, end: Date) {
  const id = uniq();
  const tenant = await prisma.tenant.create({
    data: { accountCode: `WA-V${id}`, fullName: "Penghuni Pesan", phoneE164: `+62822${id}`, dateOfBirth: new Date("2003-01-01"), idNumberEnc: encrypt(`3209100${id}`), idLast4: id.slice(-4) },
  });
  const lease = await prisma.lease.create({
    data: { tenantId: tenant.id, roomId, plan: "MONTHLY", monthlyRent: 1_400_000, deposit: 1_400_000, startDate: start, endDate: end, status: LeaseStatus.ACTIVE },
  });
  return { tenant: tenant.id, lease: lease.id };
}

beforeAll(async () => {
  const room = await makeRoom({ status: RoomStatus.OCCUPIED, type: { monthlyPrice: 1_400_000 } });
  roomId = room.id;
  roomCode = room.code;
  const now = await renter(new Date("2026-06-01"), new Date("2027-02-28"));
  const later = await renter(MAR, new Date("2027-09-01"));
  [currentTenant, currentLease, futureTenant, futureLease] = [now.tenant, now.lease, later.tenant, later.lease];
});

afterAll(() => prisma.$disconnect());

describe("a renter booked in advance", () => {
  it("is not invoiced rent while the current renter still lives there", async () => {
    const { dueDayOfMonth } = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    const threeDaysBefore = new Date(Date.UTC(2027, 0, dueDayOfMonth) - 3 * 86_400_000);
    await runRentCycle(threeDaysBefore);

    const rent = await prisma.invoice.findMany({ where: { lease: { roomId }, kind: InvoiceKind.RENT } });
    expect(rent.map((i) => i.leaseId)).toEqual([currentLease]);
    expect(rent[0].period?.toISOString()).toBe(JAN.toISOString());
  });

  it("is not billed the current renter's electricity", async () => {
    await saveMeterReadings(JAN, [{ roomId, usedKwh: 130 }]);
    const rows = (await meterSheet(JAN)).filter((r) => r.roomId === roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0].leaseId).toBe(currentLease);

    await billOverage(JAN, "owner");
    await billOverage(JAN, "owner");
    const bills = await prisma.invoice.findMany({ where: { lease: { roomId }, kind: InvoiceKind.UTILITY_OVERAGE } });
    expect(bills.map((b) => b.leaseId)).toEqual([currentLease]);
  });

  it("the meter sheet switches to the new renter in the month they move in", async () => {
    const rows = (await meterSheet(MAR)).filter((r) => r.roomId === roomId);
    expect(rows.map((r) => r.leaseId)).toEqual([futureLease]);
  });

  it("sees their move-in date, not the room's electricity usage", async () => {
    await prisma.utilityPeriod.upsert({
      where: { roomId_period: { roomId, period: firstOfMonth() } },
      create: { roomId, period: firstOfMonth(), quotaKwh: 100, usedKwh: 87, ratePerKwh: 1700 },
      update: { usedKwh: 87 },
    });
    const future = await loadRenterAccount(futureTenant);
    expect(future.electricity).toBeNull();
    expect(future.lease).toMatchObject({ roomCode, notStarted: true, startDate: MAR });

    const current = await loadRenterAccount(currentTenant);
    expect(current.electricity?.usedKwh).toBe(87);
    expect(current.lease?.notStarted).toBe(false);
  });
});
