import { ApplicationStatus, InvoiceKind } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt, sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { createApplication, createApplicationForType, termsInputFor } from "@/lib/application";
import { termsClauses, termsHash } from "@/lib/terms";
import { recordPayment } from "@/lib/payments";
import { PUT as acceptTerms } from "@/app/api/apply/route";
import { TOOLS } from "@/lib/chat/tools";
import { makeCtx, makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

/** An application that has submitted its details and is ready to agree to the terms. */
async function readyForTerms(termMonths: number | null) {
  const id = uniq();
  const room = await makeRoom();
  const raw = `${"a".repeat(30)}${id}`.slice(0, 40);
  const app = await prisma.application.create({
    data: {
      reference: `APP-L${id}`,
      tokenHash: sha256(raw),
      roomId: room.id,
      plan: "MONTHLY",
      termMonths,
      status: ApplicationStatus.DETAILS_SUBMITTED,
      fullName: "Penyewa Uji",
      phoneE164: `+6285${id}`,
      dateOfBirth: new Date("2004-01-01"),
      idNumberEnc: encrypt("3171234567890001"),
      idLast4: "0001",
      moveInDate: new Date("2027-01-15"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    include: { room: { include: { roomType: true } } },
  });
  return { room, app, raw };
}

async function agree(token: string, shownHash: string) {
  return acceptTerms(
    new NextRequest("http://localhost:3000/api/apply", {
      method: "PUT",
      headers: { "x-real-ip": `10.11.${uniq()}`, "content-type": "application/json" },
      body: JSON.stringify({ token, agreed: true, shownHash }),
    })
  );
}

describe("agreeing to the terms with a chosen length", () => {
  it("keeps the chosen length, bills only the deposit, and shows the length in the terms", async () => {
    const { room, app, raw } = await readyForTerms(12);
    const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    const terms = termsInputFor(app, settings);
    expect(termsClauses(terms)[0].body).toContain("kontrak 1 tahun");

    const res = await agree(raw, termsHash(terms));
    expect(res.status).toBe(200);

    const agreed = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    const price = room.roomType.monthlyPrice;
    expect(agreed.status).toBe(ApplicationStatus.AWAITING_PAYMENT);
    expect(agreed.signedTermMonths).toBe(12);
    expect(agreed.termsAcceptedAt).not.toBeNull();
    expect(agreed.amountDue).toBe(price * settings.depositMonths);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { applicationId: app.id } });
    expect(invoice.kind).toBe(InvoiceKind.DEPOSIT);
    expect(invoice.amount).toBe(price * settings.depositMonths);
  });

  it("refuses terms that changed since the page was shown", async () => {
    const { raw } = await readyForTerms(6);
    const res = await agree(raw, "0".repeat(64));
    expect(res.status).toBe(409);
    expect((await res.json()).reload).toBe(true);
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
