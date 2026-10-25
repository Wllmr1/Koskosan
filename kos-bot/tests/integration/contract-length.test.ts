import { ApplicationStatus, InvoiceKind } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { buildContractData, createApplication, createApplicationForType } from "@/lib/application";
import { contractClauses, contractHash } from "@/lib/contract";
import { recordPayment } from "@/lib/payments";
import { PUT as sign } from "@/app/api/apply/route";
import { TOOLS } from "@/lib/chat/tools";
import { makeCtx, makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

// A minimal PNG-looking data URL; the route only checks the prefix and a minimum size.
const SIGNATURE = `data:image/png;base64,${Buffer.alloc(400, 1).toString("base64")}`;

/** An application that has submitted its details and is ready to sign. */
async function readyToSign(termMonths: number | null, plan: "MONTHLY" | "YEARLY" = "MONTHLY") {
  const id = uniq();
  const room = await makeRoom();
  const app = await prisma.application.create({
    data: {
      reference: `APP-L${id}`,
      tokenHash: `token-l-${id}`,
      roomId: room.id,
      plan,
      termMonths,
      status: ApplicationStatus.DETAILS_SUBMITTED,
      fullName: "Penyewa Uji",
      phoneE164: `+6285${id}`,
      dateOfBirth: new Date("2004-01-01"),
      idNumberEnc: encrypt("3171234567890001"),
      idLast4: "0001",
      moveInDate: new Date("2027-01-15"),
      passwordHash: await hashPassword("password-penyewa-1"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { room, app };
}

async function signIt(appId: string, token: string) {
  const data = await buildContractData(appId, "3171234567890001");
  return sign(
    new NextRequest("http://localhost:3000/api/apply", {
      method: "PUT",
      headers: { "x-real-ip": `10.11.${uniq()}`, "content-type": "application/json" },
      body: JSON.stringify({ token, signature: SIGNATURE, agreed: "true", shownHash: contractHash(data) }),
    })
  );
}

describe("signing a contract with a chosen length", () => {
  it("keeps the chosen length, bills one month of rent plus the deposit, and shows the length in the contract", async () => {
    const { room, app } = await readyToSign(12);
    // findApplicationByToken hashes the raw token, so give it one that hashes to the stored value.
    const raw = `${"a".repeat(30)}${uniq()}`.slice(0, 40);
    const { sha256 } = await import("@/lib/crypto");
    await prisma.application.update({ where: { id: app.id }, data: { tokenHash: sha256(raw) } });

    const res = await signIt(app.id, raw);
    expect(res.status).toBe(200);

    const signed = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    const price = room.roomType.monthlyPrice;
    expect(signed.signedTermMonths).toBe(12);
    expect(signed.amountDue).toBe(price + price * settings.depositMonths);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { applicationId: app.id, kind: InvoiceKind.ONBOARDING } });
    expect(invoice.description).toContain("sewa 1 bulan + deposit");

    const clauses = contractClauses(await buildContractData(app.id, "3171234567890001"));
    expect(clauses[1].body).toContain("(1 tahun)");
    expect(clauses[2].body).not.toMatch(/tahunan/i);
  });

  it("an older yearly application still pays twelve months for twelve", async () => {
    const { room, app } = await readyToSign(null, "YEARLY");
    const raw = `${"b".repeat(30)}${uniq()}`.slice(0, 40);
    const { sha256 } = await import("@/lib/crypto");
    await prisma.application.update({ where: { id: app.id }, data: { tokenHash: sha256(raw) } });
    expect((await signIt(app.id, raw)).status).toBe(200);
    const signed = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    expect(signed.signedTermMonths).toBe(12);
    expect(signed.amountDue).toBe(room.roomType.monthlyPrice * (settings.yearlyMonths + settings.depositMonths));
  });
});

describe("a completed onboarding", () => {
  it("ends the lease the chosen number of months after the start", async () => {
    const out = await createApplicationForType({
      contactId: null,
      typeSlug: (await makeRoom()).roomType.slug,
      months: 24,
      moveIn: new Date("2027-01-15T00:00:00Z"),
    });
    const app = await prisma.application.findUniqueOrThrow({ where: { reference: out.reference } });
    expect(app.termMonths).toBe(24);

    const id = uniq();
    await prisma.application.update({
      where: { id: app.id },
      data: {
        status: ApplicationStatus.AWAITING_PAYMENT,
        fullName: "Penyewa Dua",
        phoneE164: `+6286${id}`,
        dateOfBirth: new Date("2004-01-01"),
        idNumberEnc: encrypt("3171234567890002"),
        idLast4: "0002",
        passwordHash: await hashPassword("password-penyewa-2"),
        signedAt: new Date(),
        signedMonthlyRent: 1_000_000,
        signedDeposit: 1_000_000,
        signedTermMonths: 24,
      },
    });
    const { createLocalInvoice } = await import("@/lib/billing");
    const invoice = await createLocalInvoice({
      kind: InvoiceKind.ONBOARDING,
      description: "Pembayaran pertama (test)",
      amount: 2_000_000,
      dueDate: new Date(),
      applicationId: app.id,
    });
    await recordPayment({ invoiceCode: invoice.code, eventId: `sim-len-${uniq()}`, amount: 2_000_000, method: "SIMULATED", paidAt: new Date() });

    const lease = await prisma.lease.findFirstOrThrow({ where: { roomId: app.roomId } });
    expect(lease.plan).toBe("MONTHLY");
    expect(lease.startDate.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(lease.endDate.toISOString().slice(0, 10)).toBe("2029-01-15");
  });
});

describe("start_application (assistant)", () => {
  const tool = TOOLS.find((t) => t.name === "start_application")!;

  it("takes a contract length of 6, 12 or 24 months and no payment plan", () => {
    const schema = tool.input_schema as { properties: Record<string, { enum?: number[] }>; required: string[] };
    expect(schema.properties.months.enum).toEqual([6, 12, 24]);
    expect(schema.properties.plan).toBeUndefined();
    expect(schema.required).toEqual(["room_code", "months"]);
  });

  it("starts a monthly-paid application for the chosen length", async () => {
    const room = await makeRoom();
    const ctx = makeCtx({ contactId: (await prisma.contact.create({
      data: { channel: "WEB", webSessionId: `anon:len-${uniq()}`, type: "PROSPECT", expiresAt: new Date(Date.now() + 86_400_000) },
    })).id });
    const out = (await tool.run({ room_code: room.code, months: 24 }, ctx)) as { reference: string; contract: string };
    expect(out.contract).toBe("2 tahun");
    const app = await prisma.application.findUniqueOrThrow({ where: { reference: out.reference } });
    expect(app.plan).toBe("MONTHLY");
    expect(app.termMonths).toBe(24);
  });

  it("refuses a length that is not offered", async () => {
    const room = await makeRoom();
    await expect(tool.run({ room_code: room.code, months: 5 }, makeCtx())).rejects.toThrow(/6, 12 or 24/);
  });

  it("createApplication stores the length", async () => {
    const room = await makeRoom();
    const out = await createApplication({ contactId: null, roomCode: room.code, months: 6 });
    expect((await prisma.application.findUniqueOrThrow({ where: { reference: out.reference } })).termMonths).toBe(6);
  });
});
