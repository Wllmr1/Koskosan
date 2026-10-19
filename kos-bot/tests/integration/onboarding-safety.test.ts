import { ApplicationStatus, InvoiceKind } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createLocalInvoice } from "@/lib/billing";
import { hashPassword, verifyPassword } from "@/lib/password";
import { recordPayment } from "@/lib/payments";
import { purgeChatMemory } from "@/lib/jobs";
import { getObject, putObject } from "@/lib/storage";
import { uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

async function application(opts: {
  roomCode: string;
  phone: string;
  idNumber: string;
  dob?: string;
  status?: ApplicationStatus;
  signed?: { rent: number; deposit: number; months: number };
}) {
  const id = uniq();
  const room = await prisma.room.findFirstOrThrow({ where: { code: opts.roomCode } });
  const contact = await prisma.contact.create({
    data: { channel: "WEB", webSessionId: `anon:safety-${id}`, type: "PROSPECT", expiresAt: new Date(Date.now() + 86_400_000) },
  });
  const app = await prisma.application.create({
    data: {
      reference: `APP-S${id}`,
      tokenHash: `token-s-${id}`,
      contactId: contact.id,
      roomId: room.id,
      plan: "MONTHLY",
      status: opts.status ?? ApplicationStatus.AWAITING_PAYMENT,
      fullName: "Pelamar Uji",
      phoneE164: opts.phone,
      dateOfBirth: new Date(opts.dob ?? "2004-01-01"),
      idNumberEnc: encrypt(opts.idNumber),
      idLast4: opts.idNumber.slice(-4),
      moveInDate: new Date("2026-11-01"),
      signedAt: new Date(),
      passwordHash: await hashPassword("password-pelamar-1"),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...(opts.signed
        ? { signedMonthlyRent: opts.signed.rent, signedDeposit: opts.signed.deposit, signedTermMonths: opts.signed.months }
        : {}),
    },
  });
  const invoice = await createLocalInvoice({
    kind: InvoiceKind.ONBOARDING,
    description: "Pembayaran pertama (test)",
    amount: 2_000_000,
    dueDate: new Date(),
    applicationId: app.id,
  });
  return { room, contact, app, invoice };
}

const pay = (code: string, amount: number) =>
  recordPayment({ invoiceCode: code, eventId: `sim-safety-${uniq()}`, amount, method: "SIMULATED", paidAt: new Date() });

describe("abandoned applications do not keep personal data", () => {
  it("an expired application is scrubbed and its KTP and signature files deleted", async () => {
    const id = uniq();
    const { app } = await application({ roomCode: "C-302", phone: `+62815${id}`, idNumber: `3203000${id}` });
    const ktpKey = `ktp/${app.reference}-test.jpg`;
    const sigKey = `signatures/${app.reference}.png`;
    await putObject(ktpKey, Buffer.from("ktp"), "image/jpeg");
    await putObject(sigKey, Buffer.from("sig"), "image/png");
    await prisma.application.update({
      where: { id: app.id },
      data: { ktpObjectKey: ktpKey, signatureKey: sigKey, expiresAt: new Date(Date.now() - 1000) },
    });

    await purgeChatMemory();

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe(ApplicationStatus.EXPIRED);
    expect([after.fullName, after.phoneE164, after.dateOfBirth, after.idNumberEnc, after.idLast4, after.ktpObjectKey, after.signatureKey, after.passwordHash]).toEqual(
      [null, null, null, null, null, null, null, null]
    );
    await expect(getObject(ktpKey)).rejects.toThrow();
    await expect(getObject(sigKey)).rejects.toThrow();
  });
});

describe("the lease follows the signed contract", () => {
  it("keeps the signed rent, deposit and term even if the owner changes the room afterwards", async () => {
    const id = uniq();
    const { room, invoice } = await application({
      roomCode: "B-204",
      phone: `+62816${id}`,
      idNumber: `3204000${id}`,
      signed: { rent: 1_850_000, deposit: 1_850_000, months: 3 },
    });
    await prisma.room.update({ where: { id: room.id }, data: { monthlyPrice: 2_400_000 } });
    try {
      expect(await pay(invoice.code, invoice.amount)).toBe("paid");
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { phoneE164: `+62816${id}` }, include: { leases: true } });
      const lease = tenant.leases[0];
      expect(lease.monthlyRent).toBe(1_850_000);
      expect(lease.deposit).toBe(1_850_000);
      expect(lease.endDate.toISOString().slice(0, 10)).toBe("2027-02-01");
    } finally {
      await prisma.room.update({ where: { id: room.id }, data: { monthlyPrice: room.monthlyPrice } });
    }
  });
});

describe("an application cannot take over an existing renter's account", () => {
  async function existingRenter() {
    const id = uniq();
    return prisma.tenant.create({
      data: {
        accountCode: `WA-X${id}`,
        fullName: "Penghuni Asli",
        phoneE164: `+62817${id}`,
        dateOfBirth: new Date("2002-02-02"),
        idNumberEnc: encrypt(`3205000${id}`),
        idLast4: id.slice(-4),
        passwordHash: await hashPassword("password-asli-123"),
      },
    });
  }

  it("a different person using the renter's phone is held for the owner, account untouched", async () => {
    const renter = await existingRenter();
    const { app, invoice } = await application({ roomCode: "A-105", phone: renter.phoneE164, idNumber: "3209999999990001" });

    expect(await pay(invoice.code, invoice.amount)).toBe("paid");

    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: renter.id }, include: { leases: true } });
    expect(await verifyPassword("password-asli-123", after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(renter.sessionVersion);
    expect(after.fullName).toBe("Penghuni Asli");
    expect(after.leases).toHaveLength(0);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.NEEDS_REVIEW);
    expect(await prisma.ownerNotification.findUnique({ where: { dedupeKey: `review:${app.reference}` } })).not.toBeNull();
  });

  it("the same person (same KTP and date of birth) coming back gets the new lease and password", async () => {
    const renter = await existingRenter();
    const idNumber = `3205000${renter.accountCode.slice(4)}`;
    const { invoice } = await application({ roomCode: "B-206", phone: renter.phoneE164, idNumber, dob: "2002-02-02" });

    expect(await pay(invoice.code, invoice.amount)).toBe("paid");

    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: renter.id }, include: { leases: true } });
    expect(after.leases).toHaveLength(1);
    expect(await verifyPassword("password-pelamar-1", after.passwordHash)).toBe(true);
  });
});
