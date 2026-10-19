import { ApplicationStatus, Channel, InvoiceKind, InvoiceStatus, LeaseStatus, RoomStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { log } from "./logger";
import { addMonths, niceDate, rp } from "./money";
import { notifyOwner } from "./notify";
import { termMonths } from "./application";
import { promoteToMember } from "./chat/context";
import { deliverToContact, deliverToRenter } from "./chat/deliver";

export type PaymentInput = {
  invoiceCode: string;
  /** Unique per payment event: "xendit:<id>" or "sim-<uuid>". Makes this idempotent. */
  eventId: string;
  amount: number;
  method: string;
  paidAt: Date;
  raw?: unknown;
};
export type PaymentOutcome = "duplicate" | "unknown_invoice" | "partial" | "paid";

/**
 * The ONLY place an invoice becomes paid. Called by the Xendit webhook and, in
 * development, by the fake payment page — so a simulated payment runs exactly
 * the code a real one does. The chatbot can never call this.
 */
export async function recordPayment(input: PaymentInput): Promise<PaymentOutcome> {
  try {
    await prisma.processedWebhook.create({ data: { key: `payment:${input.eventId}` } });
  } catch {
    return "duplicate";
  }

  const invoice = await prisma.invoice.findUnique({
    where: { code: input.invoiceCode },
    include: { application: true, lease: { include: { room: true } }, guestStay: true },
  });
  if (!invoice) {
    log.error("payment for unknown invoice", { invoice: input.invoiceCode });
    return "unknown_invoice";
  }

  const amount = Math.round(input.amount);
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount,
      method: input.method.slice(0, 40),
      gatewayRef: input.eventId,
      paidAt: input.paidAt,
      raw: (input.raw ?? {}) as never,
    },
  });

  const totalPaid = invoice.amountPaid + amount;
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid: totalPaid, status: totalPaid >= invoice.amount ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL },
  });
  if (updated.status !== InvoiceStatus.PAID) return "partial";

  try {
    if (invoice.kind === InvoiceKind.ONBOARDING && invoice.application) {
      await completeOnboarding(invoice.application.id, invoice.id, amount, updated.code);
    } else if (invoice.kind === InvoiceKind.GUEST && invoice.guestStay) {
      await approveGuest(invoice.guestStay.id, updated.code);
    } else if (invoice.lease) {
      await confirmRent(invoice.lease.tenantId, invoice.lease.room.code, amount, updated.code, invoice.description);
    }
  } catch (error) {
    log.error("post-payment handling failed", { invoice: updated.code, message: String(error) });
  }
  return "paid";
}

export async function expireInvoiceByCode(code: string): Promise<void> {
  await prisma.invoice.updateMany({
    where: { code, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
    data: { status: InvoiceStatus.EXPIRED },
  });
}

/** Contract signed + first payment received: create the renter and lease, then tell everyone. */
async function completeOnboarding(applicationId: string, invoiceId: string, amount: number, invoiceCode: string) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { room: true, contact: true },
  });
  if (app.status === ApplicationStatus.COMPLETED) return;
  if (!app.fullName || !app.phoneE164 || !app.idNumberEnc || !app.dateOfBirth) return;

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const start = app.moveInDate ?? new Date();
  const months = termMonths(app.plan, settings.minMonths);

  const tenantCount = await prisma.tenant.count();
  const accountCode = `WA-${String(tenantCount + 1).padStart(4, "0")}`;

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { phoneE164: app.phoneE164! },
      create: {
        accountCode,
        fullName: app.fullName!,
        phoneE164: app.phoneE164!,
        dateOfBirth: app.dateOfBirth!,
        idNumberEnc: app.idNumberEnc!,
        idLast4: app.idLast4 ?? "0000",
        ktpObjectKey: app.ktpObjectKey,
        passwordHash: app.passwordHash,
      },
      update: {
        fullName: app.fullName!,
        ktpObjectKey: app.ktpObjectKey,
        // A returning renter's new password replaces the old one and logs out old sessions.
        ...(app.passwordHash ? { passwordHash: app.passwordHash, sessionVersion: { increment: 1 } } : {}),
      },
    });

    const lease = await tx.lease.create({
      data: {
        tenantId: tenant.id,
        roomId: app.roomId,
        plan: app.plan,
        monthlyRent: app.room.monthlyPrice,
        deposit: app.room.monthlyPrice * settings.depositMonths,
        startDate: start,
        endDate: addMonths(start, months),
        status: LeaseStatus.ACTIVE,
        signedAt: app.signedAt ?? new Date(),
        contractKey: app.contractKey,
      },
    });

    await tx.invoice.update({ where: { id: invoiceId }, data: { leaseId: lease.id } });
    await tx.room.update({ where: { id: app.roomId }, data: { status: RoomStatus.OCCUPIED, availableOn: null } });
    await tx.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.COMPLETED, leaseId: lease.id } });

    // First month's electricity period, so the quota tool has something to read.
    const period = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    await tx.utilityPeriod.upsert({
      where: { roomId_period: { roomId: app.roomId, period } },
      create: { roomId: app.roomId, period, quotaKwh: settings.electricQuota, ratePerKwh: settings.electricRate },
      update: {},
    });

    return { tenant, lease };
  });

  await notifyOwner({
    dedupeKey: `contract:${app.reference}`,
    title: "Kontrak baru ditandatangani dan dibayar",
    subject: `Kontrak ${app.room.code} ditandatangani: ${app.fullName}`,
    body: [
      `Penyewa baru: ${app.fullName}`,
      `Akun: ${result.tenant.accountCode}`,
      `Kamar: ${app.room.code} (${app.room.type})`,
      `Skema: ${app.plan === "YEARLY" ? "tahunan" : "bulanan"}`,
      `Mulai: ${niceDate(start)}`,
      `Dibayar: ${rp(amount)} (${invoiceCode})`,
      `HP: ${app.phoneE164}`,
      `KTP: ••••${app.idLast4}`,
      ``,
      `Kontrak PDF tersimpan di dashboard pemilik.`,
    ].join("\n"),
    short: `Kontrak ${app.room.code} ditandatangani & dibayar ${rp(amount)} oleh ${app.fullName!.split(" ")[0]}.`,
  });

  const welcome = `Kontrak kamar *${app.room.code}* sudah ditandatangani dan pembayaran *${rp(amount)}* kami terima ✅\n\nSelamat datang di ${settings.name}, kak ${app.fullName.split(" ")[0]}! Akun kakak: ${result.tenant.accountCode}.`;

  if (app.contact?.channel === Channel.WHATSAPP) {
    // The WhatsApp chat that led here becomes the renter's chat.
    await promoteToMember(app.contact.id, result.tenant.id);
  } else if (app.contactId) {
    // Website: the visitor's anonymous chat gets the news and a way to log in.
    // It still expires after 24 hours; the renter's own chat is separate.
    await deliverToContact(
      app.contactId,
      `${welcome}\n\nMasuk pakai nomor HP dan password yang tadi kakak buat untuk cek tagihan, kuota listrik, atau daftar tamu.`,
      [{ kind: "link", label: "Masuk", path: "/masuk" }]
    );
  }
  await deliverToRenter(result.tenant.id, `${welcome}\n\nAda yang mau ditanyakan soal pindahan?`);
}

async function approveGuest(guestStayId: string, invoiceCode: string) {
  const stay = await prisma.guestStay.update({
    where: { id: guestStayId },
    data: { approved: true },
    include: { tenant: { include: { leases: { where: { status: "ACTIVE" }, include: { room: true }, take: 1 } } } },
  });
  const room = stay.tenant.leases[0]?.room.code ?? "-";

  await notifyOwner({
    dedupeKey: `guest:${stay.code}`,
    title: "Tamu menginap terdaftar",
    subject: `Tamu menginap di kamar ${room}`,
    body: `${stay.tenant.fullName} (kamar ${room}) mendaftarkan tamu.\n\nTamu: ${stay.guestName}\nMenginap: ${stay.nights} malam mulai ${niceDate(stay.checkIn)}\nBiaya: ${rp(stay.fee)} (lunas, ${invoiceCode})\nHP tamu: ${stay.phoneE164}\nKTP tamu: ••••${stay.idLast4}`,
    short: `Tamu ${stay.guestName.split(" ")[0]} menginap di ${room}, ${stay.nights} malam, lunas.`,
  });

  await deliverToRenter(
    stay.tenantId,
    `Pembayaran tamu *${rp(stay.fee)}* sudah masuk ✅\nTamu *${stay.guestName}* resmi terdaftar untuk ${stay.nights} malam mulai ${niceDate(stay.checkIn)}. Terima kasih kak!`
  );
}

async function confirmRent(tenantId: string, roomCode: string, amount: number, invoiceCode: string, description: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  await notifyOwner({
    dedupeKey: `rent:${invoiceCode}`,
    title: "Pembayaran sewa masuk",
    subject: `Sewa kamar ${roomCode} lunas — ${tenant.fullName}`,
    body: `${tenant.fullName} (${tenant.accountCode}, kamar ${roomCode}) membayar ${rp(amount)}.\n\n${description}\nTagihan: ${invoiceCode}`,
    short: `Sewa ${roomCode} ${rp(amount)} lunas dari ${tenant.fullName.split(" ")[0]}.`,
  });

  await deliverToRenter(tenantId, `Pembayaran *${rp(amount)}* untuk ${invoiceCode} sudah kami terima ✅ Terima kasih kak!`);
}
