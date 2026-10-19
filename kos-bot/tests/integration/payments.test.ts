import { ApplicationStatus, InvoiceKind, RoomStatus } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createLocalInvoice, ensurePaymentUrl } from "@/lib/billing";
import { recordPayment } from "@/lib/payments";
import { purgeChatMemory } from "@/lib/jobs";
import { uniq } from "../helpers";
import { hashPassword, verifyPassword } from "@/lib/password";

afterAll(() => prisma.$disconnect());

async function signedApplication(roomCode: string) {
  const id = uniq();
  const room = await prisma.room.findFirstOrThrow({ where: { code: roomCode } });
  const contact = await prisma.contact.create({
    data: { channel: "WEB", webSessionId: `anon:pay-${id}`, type: "PROSPECT", expiresAt: new Date(Date.now() + 86_400_000) },
  });
  const app = await prisma.application.create({
    data: {
      reference: `APP-T${id}`,
      tokenHash: `token-${id}`,
      contactId: contact.id,
      roomId: room.id,
      plan: "MONTHLY",
      status: ApplicationStatus.AWAITING_PAYMENT,
      fullName: "Budi Santoso",
      phoneE164: `+62812${id}`,
      dateOfBirth: new Date("2004-01-01"),
      idNumberEnc: encrypt(`3201000${id}`),
      idLast4: id.slice(-4),
      moveInDate: new Date("2026-11-01"),
      signedAt: new Date(),
      passwordHash: await hashPassword("kamar-impian-123"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const invoice = await createLocalInvoice({
    kind: InvoiceKind.ONBOARDING,
    description: "Pembayaran pertama (test)",
    amount: room.monthlyPrice * 2,
    dueDate: new Date(),
    applicationId: app.id,
  });
  return { room, contact, app, invoice };
}

const pay = (code: string, amount: number) => ({
  invoiceCode: code,
  eventId: `sim-test-${uniq()}`,
  amount,
  method: "SIMULATED",
  paidAt: new Date(),
});

describe("recordPayment on a signed application", () => {
  it("creates the renter, lease and occupied room, tells everyone, and is idempotent", async () => {
    const { room, contact, app, invoice } = await signedApplication("A-105");

    expect(await ensurePaymentUrl(invoice.id)).toBe(`http://localhost:3000/dev/pay/${invoice.code}`);

    const event = pay(invoice.code, invoice.amount);
    expect(await recordPayment(event)).toBe("paid");
    expect(await recordPayment(event)).toBe("duplicate");

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { phoneE164: app.phoneE164! }, include: { leases: true } });
    expect(await verifyPassword("kamar-impian-123", tenant.passwordHash)).toBe(true);
    expect(tenant.leases).toHaveLength(1);
    expect(tenant.leases[0].status).toBe("ACTIVE");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(RoomStatus.OCCUPIED);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(ApplicationStatus.COMPLETED);

    const alert = await prisma.ownerNotification.findUnique({ where: { dedupeKey: `contract:${app.reference}` } });
    expect(alert?.title).toMatch(/Kontrak baru/);

    const anonMsg = await prisma.message.findFirst({ where: { conversation: { contactId: contact.id }, role: "ASSISTANT" } });
    expect(anonMsg?.content).toMatch(/Kontrak kamar \*A-105\*/);
    expect(anonMsg?.actions).toEqual([{ kind: "link", label: "Masuk", path: "/masuk" }]);

    const renterMsg = await prisma.message.findFirst({
      where: { conversation: { contact: { webSessionId: `renter:${tenant.id}` } } },
    });
    expect(renterMsg?.content).toMatch(/Selamat datang/);
  });

  it("the 24-hour purge of the visitor's chat keeps the signed application", async () => {
    const { contact, app, invoice } = await signedApplication("B-206");
    await recordPayment(pay(invoice.code, invoice.amount));

    await prisma.contact.update({ where: { id: contact.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await purgeChatMemory();

    expect(await prisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
    const kept = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(kept.status).toBe(ApplicationStatus.COMPLETED);
    expect(kept.contactId).toBeNull();
  });

  it("an unknown invoice is reported, not thrown", async () => {
    expect(await recordPayment(pay("INV-NOPE-0000", 1))).toBe("unknown_invoice");
  });
});
