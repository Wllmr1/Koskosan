import { NextRequest, NextResponse } from "next/server";
import { ApplicationStatus, InvoiceKind, InvoiceStatus, LeaseStatus, RoomStatus } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import { addMonths, niceDate, rp } from "@/lib/money";
import { notifyOwner } from "@/lib/notify";
import { sendText, waIdFromE164 } from "@/lib/whatsapp";
import { promoteToMember } from "@/lib/chat/context";
import { termMonths } from "@/lib/application";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Xendit tells us a payment landed. This is the ONLY place an invoice becomes
 * paid — the chatbot can never mark anything as paid.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-callback-token") ?? "";
  if (!safeEqual(token, env().XENDIT_WEBHOOK_TOKEN)) {
    log.warn("xendit webhook: bad callback token");
    return new NextResponse("invalid token", { status: 401 });
  }

  const event = (await req.json().catch(() => null)) as XenditEvent | null;
  if (!event?.id || !event.external_id) return NextResponse.json({ ok: true });

  // Idempotent: Xendit retries, and a double-credit would be a real money bug.
  try {
    await prisma.processedWebhook.create({ data: { key: `xendit:${event.id}` } });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.status !== "PAID" && event.status !== "SETTLED") {
    if (event.status === "EXPIRED") {
      await prisma.invoice.updateMany({
        where: { code: event.external_id, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
        data: { status: InvoiceStatus.EXPIRED },
      });
    }
    return NextResponse.json({ ok: true });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { code: event.external_id },
    include: { application: { include: { room: true, contact: true } }, lease: { include: { room: true, tenant: true } }, guestStay: { include: { tenant: true } } },
  });
  if (!invoice) {
    log.error("xendit webhook: unknown invoice", { externalId: event.external_id });
    return NextResponse.json({ ok: true });
  }

  const amount = Math.round(Number(event.paid_amount ?? event.amount ?? 0));
  const paidAt = event.paid_at ? new Date(event.paid_at) : new Date();

  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount,
      method: String(event.payment_method ?? event.payment_channel ?? "UNKNOWN"),
      gatewayRef: event.id,
      paidAt,
      raw: event as never,
    },
  });

  const totalPaid = invoice.amountPaid + amount;
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaid: totalPaid,
      status: totalPaid >= invoice.amount ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
    },
  });

  if (updated.status !== InvoiceStatus.PAID) return NextResponse.json({ ok: true });

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

  return NextResponse.json({ ok: true });
}

/** Contract signed + first payment received: create the tenant, lease, and alert the owner. */
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
      },
      update: { fullName: app.fullName!, ktpObjectKey: app.ktpObjectKey },
    });

    const lease = await tx.lease.create({
      data: {
        tenantId: tenant.id,
        roomId: app.roomId,
        plan: app.plan,
        monthlyRent: app.room.monthlyPrice,
        deposit: app.room.monthlyPrice,
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

  // The person who chatted is now a renter: their chat memory stops expiring.
  if (app.contactId) await promoteToMember(app.contactId, result.tenant.id);

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

  await sendText(
    waIdFromE164(app.phoneE164),
    `Kontrak kamar *${app.room.code}* sudah ditandatangani dan pembayaran *${rp(amount)}* kami terima ✅\n\nSelamat datang di ${settings.name}, kak ${app.fullName.split(" ")[0]}! Akun kakak: ${result.tenant.accountCode}.\n\nAda yang mau ditanyakan soal pindahan?`
  ).catch(() => undefined);
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

  await sendText(
    waIdFromE164(stay.tenant.phoneE164),
    `Pembayaran tamu *${rp(stay.fee)}* sudah masuk ✅\nTamu *${stay.guestName}* resmi terdaftar untuk ${stay.nights} malam mulai ${niceDate(stay.checkIn)}. Terima kasih kak!`
  ).catch(() => undefined);
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

  await sendText(
    waIdFromE164(tenant.phoneE164),
    `Pembayaran *${rp(amount)}* untuk ${invoiceCode} sudah kami terima ✅ Terima kasih kak!`
  ).catch(() => undefined);
}

type XenditEvent = {
  id: string;
  external_id: string;
  status: string;
  amount?: number;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: string;
  payment_channel?: string;
};
