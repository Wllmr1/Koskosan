import { InvoiceKind, InvoiceStatus, LeasePlan, LeaseStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { putObject } from "@/lib/storage";
import { firstOfMonth } from "@/lib/money";
import { loadRenterAccount } from "@/lib/renter-account";
import { renterCookieValue } from "@/lib/renter-auth";
import { GET as downloadContract } from "@/app/api/akun/kontrak/route";
import { uniq } from "../helpers";

const DAY = 86_400_000;
let tenantId = "";
let otherId = "";
let contractKey = "";

async function makeTenant(status: LeaseStatus, withContract: boolean) {
  const id = uniq();
  const room = await prisma.room.create({
    data: { code: `R${id}`.slice(0, 12), type: "Deluxe", floor: 2, sizeLabel: "3 × 4 m", monthlyPrice: 1_850_000, bathroom: "Dalam", extras: "AC" },
  });
  const tenant = await prisma.tenant.create({
    data: {
      accountCode: `WA-K${id}`,
      fullName: "Sari Penghuni",
      phoneE164: `+62819${id}`,
      dateOfBirth: new Date("2003-01-01"),
      idNumberEnc: encrypt(`3207000${id}`),
      idLast4: id.slice(-4),
    },
  });
  const key = `contracts/APP-K${id}.pdf`;
  if (withContract) await putObject(key, Buffer.from("%PDF-1.7 test"), "application/pdf");
  const lease = await prisma.lease.create({
    data: {
      tenantId: tenant.id,
      roomId: room.id,
      plan: LeasePlan.MONTHLY,
      monthlyRent: 1_850_000,
      deposit: 1_850_000,
      startDate: new Date(Date.now() - 40 * DAY),
      endDate: new Date(Date.now() + 50 * DAY),
      status,
      contractKey: withContract ? key : null,
    },
  });
  return { tenant, room, lease, key };
}

beforeAll(async () => {
  const { tenant, room, lease, key } = await makeTenant(LeaseStatus.ACTIVE, true);
  tenantId = tenant.id;
  contractKey = key;

  // Overdue rent (10 days late), a guest fee, a paid bill, and the electricity reading.
  const code = () => `INV-T-${uniq()}`;
  await prisma.invoice.create({
    data: { code: code(), leaseId: lease.id, kind: InvoiceKind.RENT, description: "Sewa bulan ini", amount: 1_850_000, dueDate: new Date(Date.now() - 10 * DAY) },
  });
  const stay = await prisma.guestStay.create({
    data: {
      code: `GST-K${uniq()}`, tenantId: tenant.id, guestName: "Tamu", phoneE164: "+6281200000999",
      idNumberEnc: encrypt("3201999900001111"), idLast4: "1111", checkIn: new Date(Date.now() + 2 * DAY), nights: 1, fee: 50_000,
    },
  });
  await prisma.invoice.create({
    data: { code: code(), guestStayId: stay.id, kind: InvoiceKind.GUEST, description: "Tamu menginap", amount: 50_000, dueDate: new Date(Date.now() + 2 * DAY) },
  });
  const paid = await prisma.invoice.create({
    data: { code: code(), leaseId: lease.id, kind: InvoiceKind.ONBOARDING, description: "Pembayaran pertama", amount: 3_700_000, amountPaid: 3_700_000, status: InvoiceStatus.PAID, dueDate: new Date(Date.now() - 40 * DAY) },
  });
  await prisma.payment.create({
    data: { invoiceId: paid.id, amount: 3_700_000, method: "SIMULATED", gatewayRef: `sim-acct-${uniq()}`, paidAt: new Date(Date.now() - 40 * DAY), raw: {} },
  });
  await prisma.utilityPeriod.upsert({
    where: { roomId_period: { roomId: room.id, period: firstOfMonth() } },
    create: { roomId: room.id, period: firstOfMonth(), quotaKwh: 100, usedKwh: 112.5, ratePerKwh: 1700 },
    update: { usedKwh: 112.5 },
  });
  await prisma.ticket.create({
    data: { code: `TKT-K${uniq()}`, tenantId: tenant.id, category: "listrik", description: "Lampu kamar mandi mati", urgency: "biasa" },
  });

  // Someone else's bill must never show up.
  const other = await makeTenant(LeaseStatus.ACTIVE, false);
  otherId = other.tenant.id;
  await prisma.invoice.create({
    data: { code: code(), leaseId: other.lease.id, kind: InvoiceKind.RENT, description: "Bukan milik Sari", amount: 999_000, dueDate: new Date() },
  });
});

afterAll(() => prisma.$disconnect());

describe("loadRenterAccount", () => {
  it("shows the renter's room, contract and days left", async () => {
    const acct = await loadRenterAccount(tenantId);
    expect(acct.lease?.roomCode).toMatch(/^R/);
    expect(acct.lease?.status).toBe("ACTIVE");
    expect(acct.lease?.daysLeft).toBeGreaterThanOrEqual(49);
    expect(acct.lease?.hasContract).toBe(true);
    expect(acct.lease?.monthlyRent).toBe(1_850_000);
  });

  it("lists only this renter's unpaid bills, with late fee on overdue rent", async () => {
    const acct = await loadRenterAccount(tenantId);
    const descriptions = acct.bills.map((b) => b.description);
    expect(descriptions).toContain("Sewa bulan ini");
    expect(descriptions).toContain("Tamu menginap");
    expect(descriptions).not.toContain("Bukan milik Sari");
    expect(descriptions).not.toContain("Pembayaran pertama");
    const rent = acct.bills.find((b) => b.description === "Sewa bulan ini")!;
    expect(rent.overdue).toBe(true);
    expect(rent.lateFee).toBe(250_000); // 10 days × Rp25.000, capped at Rp250.000
    expect(acct.totalOwed).toBe(1_850_000 + 50_000);
  });

  it("works out the electricity over-limit", async () => {
    const acct = await loadRenterAccount(tenantId);
    expect(acct.electricity).toMatchObject({ usedKwh: 112.5, quotaKwh: 100, remainingKwh: 0, overKwh: 12.5, extraCharge: 21_250 });
  });

  it("includes payment history, guests and complaints", async () => {
    const acct = await loadRenterAccount(tenantId);
    expect(acct.payments[0]).toMatchObject({ amount: 3_700_000, description: "Pembayaran pertama" });
    expect(acct.guests[0]).toMatchObject({ idLast4: "1111" });
    expect(acct.tickets[0]).toMatchObject({ description: "Lampu kamar mandi mati", status: "OPEN" });
  });

  it("knows whether the move-out notice deadline has already passed", async () => {
    expect((await loadRenterAccount(tenantId)).lease?.noticePassed).toBe(false); // 50 days left
    const soon = new Date(Date.now() + 40 * DAY); // only 10 days left at that moment
    expect((await loadRenterAccount(tenantId, soon)).lease?.noticePassed).toBe(true);
  });

  it("an ended lease is shown as ended, with no electricity reading", async () => {
    const ended = await makeTenant(LeaseStatus.ENDED, false);
    const acct = await loadRenterAccount(ended.tenant.id);
    expect(acct.lease?.status).toBe("ENDED");
    expect(acct.electricity).toBeNull();
  });
});

describe("GET /api/akun/kontrak", () => {
  const get = (cookie?: string) =>
    downloadContract(new NextRequest("http://localhost:3000/api/akun/kontrak", { headers: cookie ? { cookie: `kos_renter=${cookie}` } : {} }));

  it("serves the logged-in renter their own signed contract", async () => {
    const res = await get(renterCookieValue(tenantId, 0));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toContain("%PDF");
    expect(contractKey).toMatch(/^contracts\//);
  });

  it("refuses without a session", async () => {
    expect((await get()).status).toBe(401);
  });

  it("a renter without a contract file gets 404, never someone else's", async () => {
    expect((await get(renterCookieValue(otherId, 0))).status).toBe(404);
  });
});
