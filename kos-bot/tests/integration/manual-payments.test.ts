import { ApplicationStatus, Channel, ContactType, InvoiceKind, InvoiceStatus, LeaseStatus, ProofStatus, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt, sha256 } from "@/lib/crypto";
import { termsInputFor } from "@/lib/application";
import { termsHash } from "@/lib/terms";
import { acceptProof, billState, rejectProof, submitProof } from "@/lib/payment-proofs";
import { recordSignedContract } from "@/lib/onboarding";
import { loadRenterAccount } from "@/lib/renter-account";
import { renterCookieValue, RENTER_COOKIE } from "@/lib/renter-auth";
import { TOOLS } from "@/lib/chat/tools";
import { PUT as acceptTerms } from "@/app/api/apply/route";
import { POST as uploadDepositProof } from "@/app/api/apply/proof/route";
import { POST as uploadBillProof } from "@/app/api/akun/bukti/route";
import { makeCtx, makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

/** Passes the magic-byte check: a PNG signature and some padding. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const pngFile = () => new File([new Uint8Array(PNG)], "bukti.png", { type: "image/png" });
const day = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
};

beforeAll(async () => {
  await prisma.propertySetting.update({
    where: { id: "default" },
    data: { bankName: "BCA", bankAccountNumber: "1234567890", bankAccountName: "RoemahKOE" },
  });
});

/** A website visitor who has filled in their details and is at the terms step. */
async function applicant(moveInOffsetDays = 30) {
  const id = uniq();
  const room = await makeRoom();
  const contact = await prisma.contact.create({
    data: { channel: Channel.WEB, webSessionId: `anon:mp-${id}`, type: ContactType.PROSPECT, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  const raw = `${"m".repeat(30)}${id}`.slice(0, 40);
  const app = await prisma.application.create({
    data: {
      reference: `APP-M${id}`,
      tokenHash: sha256(raw),
      contactId: contact.id,
      roomId: room.id,
      plan: "MONTHLY",
      termMonths: 6,
      status: ApplicationStatus.DETAILS_SUBMITTED,
      fullName: "Calon Penghuni",
      phoneE164: `+6287${id}`,
      dateOfBirth: new Date("2004-02-02"),
      idNumberEnc: encrypt(`3171${id}`.padEnd(16, "0").slice(0, 16)),
      idLast4: "0000",
      moveInDate: day(moveInOffsetDays),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    include: { room: { include: { roomType: true } } },
  });
  await prisma.room.update({ where: { id: room.id }, data: { status: RoomStatus.BOOKED } });
  return { room, app, raw, contact };
}

async function agree(app: Awaited<ReturnType<typeof applicant>>["app"], raw: string) {
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const res = await acceptTerms(
    new NextRequest("http://localhost:3000/api/apply", {
      method: "PUT",
      headers: { "x-real-ip": `10.21.${uniq()}`, "content-type": "application/json" },
      body: JSON.stringify({ token: raw, agreed: true, shownHash: termsHash(termsInputFor(app, settings)) }),
    })
  );
  expect(res.status).toBe(200);
  return prisma.invoice.findFirstOrThrow({ where: { applicationId: app.id, kind: InvoiceKind.DEPOSIT } });
}

async function postProof(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("proof", pngFile());
  return uploadDepositProof(
    new NextRequest("http://localhost:3000/api/apply/proof", { method: "POST", headers: { "x-real-ip": `10.22.${uniq()}` }, body: form })
  );
}

describe("deposit by bank transfer, checked by the owner", () => {
  it("goes terms → deposit invoice → proof → reject → proof → accept → account + pending lease → paper contract", async () => {
    const { room, app, raw, contact } = await applicant(30);
    const deposit = await agree(app, raw);
    expect(deposit.amount).toBe(room.roomType.monthlyPrice);

    // Proof from the application page.
    expect((await postProof({ token: raw })).status).toBe(200);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.PROOF_SUBMITTED);
    const first = await prisma.paymentProof.findFirstOrThrow({ where: { invoiceId: deposit.id } });
    expect(first.status).toBe(ProofStatus.SUBMITTED);
    expect(first.fileKey).toMatch(/^proofs\//);
    expect(await prisma.ownerNotification.findUnique({ where: { dedupeKey: `proof:${first.id}` } })).not.toBeNull();

    // Owner rejects: the applicant can pay again, and hears why in their chat.
    expect(await rejectProof(first.id, "Nominal kurang", "owner")).toBe("rejected");
    expect(await rejectProof(first.id, "lagi", "owner")).toBe("already");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.AWAITING_PAYMENT);
    const told = await prisma.message.findFirst({ where: { conversation: { contactId: contact.id }, content: { contains: "Nominal kurang" } } });
    expect(told).not.toBeNull();
    const rejectedInv = await prisma.invoice.findUniqueOrThrow({ where: { id: deposit.id }, include: { proofs: true } });
    expect(billState(rejectedInv, rejectedInv.proofs)).toBe("rejected");

    // Second proof, accepted.
    expect((await postProof({ token: raw })).status).toBe(200);
    const second = await prisma.paymentProof.findFirstOrThrow({ where: { invoiceId: deposit.id, status: ProofStatus.SUBMITTED } });
    expect(await acceptProof(second.id, "owner")).toBe("accepted");
    expect(await acceptProof(second.id, "owner")).toBe("already");

    const verified = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(verified.status).toBe(ApplicationStatus.VERIFIED);
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(paid.status).toBe(InvoiceStatus.PAID);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { phoneE164: app.phoneE164! } });
    expect(tenant.passwordHash).toBeNull();
    expect(await prisma.passwordSetupToken.count({ where: { tenantId: tenant.id, usedAt: null } })).toBe(1);
    const lease = await prisma.lease.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(lease.status).toBe(LeaseStatus.PENDING);
    expect(lease.id).toBe(verified.leaseId);
    expect(paid.leaseId).toBe(lease.id);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(RoomStatus.BOOKED);

    // First month's rent is its own bill, due on move-in day.
    const rent = await prisma.invoice.findFirstOrThrow({ where: { leaseId: lease.id, kind: InvoiceKind.RENT } });
    expect(rent.amount).toBe(lease.monthlyRent);
    expect(rent.dueDate.toISOString().slice(0, 10)).toBe(app.moveInDate!.toISOString().slice(0, 10));

    // More than a week before move-in: the renter sees the type, not the room number.
    const early = await loadRenterAccount(tenant.id);
    expect(early.lease?.roomCode).toBeNull();
    expect(early.lease?.status).toBe(LeaseStatus.PENDING);
    expect(early.bills.map((b) => b.kindLabel)).toContain("Sewa");
    // Within the week: the room is "saved for them".
    const late = await loadRenterAccount(tenant.id, new Date(lease.startDate.getTime() - 3 * 86_400_000));
    expect(late.lease?.roomCode).toBe(room.code);

    // Paper contract signed: the room is theirs.
    await recordSignedContract(lease.id, null, "owner");
    expect((await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe(LeaseStatus.ACTIVE);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(RoomStatus.OCCUPIED);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.COMPLETED);
    await expect(recordSignedContract(lease.id, null, "owner")).rejects.toThrow(/sudah dicatat/);
  });

  it("refuses a non-image proof and an application that is not waiting for one", async () => {
    const { app, raw } = await applicant();
    // Still at the terms step: nothing to pay yet.
    expect((await postProof({ token: raw })).status).toBe(409);
    const deposit = await agree(app, raw);
    await expect(submitProof(deposit.id, { buffer: Buffer.from("not an image at all"), type: "image/png" })).rejects.toThrow();
  });
});

describe("get_payment_details (assistant)", () => {
  const tool = TOOLS.find((t) => t.name === "get_payment_details")!;

  it("gives the applicant the bank account and an upload link that works", async () => {
    const { app, raw, contact } = await applicant();
    const deposit = await agree(app, raw);
    const ctx = makeCtx({ contactId: contact.id });
    const out = (await tool.run({ invoice_code: deposit.code }, ctx)) as Record<string, string>;
    expect(out.account_number).toBe("1234567890");
    expect(out.bank).toBe("BCA");
    expect(ctx.actions[0]).toMatchObject({ label: "Kirim bukti transfer" });
    const upload = ctx.actions[0].path.replace("/bukti/", "");
    expect((await postProof({ upload })).status).toBe(200);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.PROOF_SUBMITTED);
  });

  it("does not hand someone else's deposit to a stranger", async () => {
    const { app, raw } = await applicant();
    const deposit = await agree(app, raw);
    await expect(tool.run({ invoice_code: deposit.code }, makeCtx({ contactId: "someone-else" }))).rejects.toThrow(/No such bill/);
  });
});

describe("renter proof upload", () => {
  it("only attaches to the renter's own bills", async () => {
    const id = uniq();
    const room = await makeRoom({ status: RoomStatus.OCCUPIED });
    const owner = await prisma.tenant.create({
      data: { accountCode: `MP-${id}`, fullName: "Pemilik Tagihan", phoneE164: `+6288${id}`, dateOfBirth: new Date("2003-01-01"), idNumberEnc: encrypt("3171000000000001"), idLast4: "0001" },
    });
    const other = await prisma.tenant.create({
      data: { accountCode: `MQ-${id}`, fullName: "Orang Lain", phoneE164: `+6289${id}`, dateOfBirth: new Date("2003-01-01"), idNumberEnc: encrypt("3171000000000002"), idLast4: "0002" },
    });
    const lease = await prisma.lease.create({
      data: { tenantId: owner.id, roomId: room.id, plan: "MONTHLY", monthlyRent: 1_000_000, deposit: 1_000_000, startDate: day(-40), endDate: day(140), status: LeaseStatus.ACTIVE },
    });
    const bill = await prisma.invoice.create({
      data: { code: `INV-MP-${id}`, kind: InvoiceKind.RENT, description: "Sewa (test)", amount: 1_000_000, dueDate: day(-2), leaseId: lease.id },
    });
    expect(billState(bill, [])).toBe("late");

    const post = (tenant: { id: string; sessionVersion: number }) => {
      const form = new FormData();
      form.set("invoice", bill.code);
      form.set("proof", pngFile());
      return uploadBillProof(
        new NextRequest("http://localhost:3000/api/akun/bukti", {
          method: "POST",
          headers: { origin: "http://localhost:3000", cookie: `${RENTER_COOKIE}=${renterCookieValue(tenant.id, tenant.sessionVersion)}` },
          body: form,
        })
      );
    };
    expect((await post(other)).status).toBe(404);
    expect((await post(owner)).status).toBe(200);
    const withProof = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id }, include: { proofs: true } });
    expect(billState(withProof, withProof.proofs)).toBe("pending");
  });

  it("counts a bill as late only from the day after it is due", () => {
    expect(billState({ status: InvoiceStatus.UNPAID, dueDate: day(0) }, [])).toBe("due");
    expect(billState({ status: InvoiceStatus.UNPAID, dueDate: day(-1) }, [])).toBe("late");
  });
});
