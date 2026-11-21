import { NextRequest, NextResponse } from "next/server";
import { ApplicationStatus, InvoiceKind, RoomStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { niceDate, normalizePhone, rp } from "@/lib/money";
import { putObject, validateImage } from "@/lib/storage";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { clientIp } from "@/lib/http";
import { applicationMonths, findApplicationByToken, firstOpenRoomOfType, roomOpenOn, termsInputFor } from "@/lib/application";
import { termsHash } from "@/lib/terms";
import { createLocalInvoice } from "@/lib/billing";
import { DEPOSIT_PAY_WINDOW_MS } from "@/lib/payment-proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const detailsSchema = z.object({
  token: z.string().min(20).max(64),
  fullName: z.string().trim().min(3).max(80),
  phone: z.string().trim().min(8).max(25),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idNumber: z.string().trim(),
  moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Step 1 of the secure flow: personal details + KTP photo. No password here:
 * the account is made after the owner verifies the deposit.
 * This is the ONLY place personal data is accepted, and it never touches chat.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await overLimit("apply-submit", ip, LIMITS.applySubmit.limit, LIMITS.applySubmit.windowMs)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  const form = await req.formData();
  const parsed = detailsSchema.safeParse({
    token: form.get("token"),
    fullName: form.get("fullName"),
    phone: form.get("phone"),
    dateOfBirth: form.get("dateOfBirth"),
    idNumber: form.get("idNumber"),
    moveInDate: form.get("moveInDate"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Data belum lengkap atau formatnya salah." }, { status: 400 });
  }
  const data = parsed.data;

  const app = await findApplicationByToken(data.token);
  if (!app) return NextResponse.json({ error: "Link sudah tidak berlaku." }, { status: 404 });
  if (app.status !== ApplicationStatus.DRAFT && app.status !== ApplicationStatus.DETAILS_SUBMITTED) {
    return NextResponse.json({ error: "Formulir ini sudah diproses." }, { status: 409 });
  }

  const moveIn = new Date(`${data.moveInDate}T00:00:00Z`);
  if (Number.isNaN(moveIn.getTime())) return NextResponse.json({ error: "Tanggal masuk tidak valid." }, { status: 400 });
  if (app.room.status === RoomStatus.OCCUPIED && app.room.availableOn && moveIn < app.room.availableOn) {
    return NextResponse.json({ error: `Tanggal masuk paling cepat ${niceDate(app.room.availableOn)}.` }, { status: 400 });
  }

  // Re-submission is allowed (they went back a step), but the room must still be free.
  // If someone else took it first, move this application to another room of the same type.
  let roomId = app.roomId;
  if (!(await roomOpenOn(app.id, roomId, moveIn))) {
    const other = await firstOpenRoomOfType({ id: app.room.roomTypeId }, moveIn);
    if (!other) {
      const type = app.room.roomType;
      return NextResponse.json(
        { error: `Maaf, kamar ${type.name} untuk tanggal itu sudah penuh. Lihat tanggal lain di /kamar/${type.slug}.` },
        { status: 409 }
      );
    }
    roomId = other.id;
  }

  // Name must look like a full name
  if (data.fullName.split(/\s+/).filter(Boolean).length < 2) {
    return NextResponse.json({ error: "Tulis nama lengkap sesuai KTP." }, { status: 400 });
  }

  const phone = normalizePhone(data.phone);
  if (!phone) return NextResponse.json({ error: "Nomor HP tidak valid." }, { status: 400 });

  const idDigits = data.idNumber.replace(/\D/g, "");
  if (idDigits.length !== 16) return NextResponse.json({ error: "Nomor KTP harus 16 digit." }, { status: 400 });

  const age = (Date.now() - new Date(data.dateOfBirth).getTime()) / 31_557_600_000;
  if (!(age >= 17 && age < 100)) {
    return NextResponse.json({ error: "Penyewa minimal berusia 17 tahun." }, { status: 400 });
  }

  // KTP photo: validated by magic bytes, stored privately, never public.
  const file = form.get("ktp");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Foto KTP wajib diunggah." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  let contentType: string;
  try {
    contentType = validateImage(buffer, file.type);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const ktpKey = `ktp/${app.reference}-${Date.now()}.${ext}`;
  await putObject(ktpKey, buffer, contentType);

  await prisma.application.update({
    where: { id: app.id },
    data: {
      roomId,
      fullName: data.fullName,
      phoneE164: phone,
      dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
      idNumberEnc: encrypt(idDigits),
      idLast4: idDigits.slice(-4),
      ktpObjectKey: ktpKey,
      moveInDate: moveIn,
      status: ApplicationStatus.DETAILS_SUBMITTED,
    },
  });

  // Hold the room while they read the terms and pay the deposit.
  await prisma.room.updateMany({
    where: { id: roomId, status: RoomStatus.AVAILABLE },
    data: { status: RoomStatus.BOOKED },
  });

  log.info("application details submitted", { reference: app.reference });
  return NextResponse.json({ ok: true, next: "terms" });
}

const termsSchema = z.object({
  token: z.string().min(20).max(64),
  agreed: z.literal(true),
  shownHash: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Step 2: the renter ticked the Terms & Conditions. Records the agreement and
 * issues the deposit invoice; they then get the bank details on WhatsApp and
 * upload the transfer proof (api/apply/proof). The contract is signed on paper.
 */
export async function PUT(req: NextRequest) {
  const ip = clientIp(req);
  if (await overLimit("apply-terms", ip, 20, 3_600_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429 });
  }

  const parsed = termsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Centang persetujuan dulu ya." }, { status: 400 });

  const app = await findApplicationByToken(parsed.data.token);
  if (!app) return NextResponse.json({ error: "Link sudah tidak berlaku." }, { status: 404 });
  if (!app.fullName || !app.idNumberEnc) return NextResponse.json({ error: "Isi data diri dulu." }, { status: 409 });

  // Already agreed: hand back the same deposit (idempotent).
  if (app.status !== ApplicationStatus.DETAILS_SUBMITTED) {
    const existing = await prisma.invoice.findFirst({ where: { applicationId: app.id, kind: InvoiceKind.DEPOSIT } });
    if (existing) return NextResponse.json({ ok: true, invoice: existing.code, amount: rp(existing.amount) });
    return NextResponse.json({ error: "Formulir ini sudah diproses." }, { status: 409 });
  }

  const moveIn = app.moveInDate ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (!(await roomOpenOn(app.id, app.roomId, moveIn))) {
    return NextResponse.json({ error: "Maaf, kamar ini sudah tidak tersedia." }, { status: 409 });
  }

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const terms = termsInputFor(app, settings);
  // The owner may have changed a price or rule while this page was open.
  if (parsed.data.shownHash !== termsHash(terms)) {
    return NextResponse.json(
      { error: "Syarat dan ketentuan baru saja berubah. Muat ulang halaman dan baca lagi ya kak.", reload: true },
      { status: 409 }
    );
  }

  const now = new Date();
  await prisma.application.update({
    where: { id: app.id },
    data: {
      termsAcceptedAt: now,
      termsAcceptedIp: ip,
      contractHash: termsHash(terms),
      amountDue: terms.deposit,
      // The terms as agreed: the lease is built from these, not from prices on verification day.
      signedMonthlyRent: terms.monthlyRent,
      signedDeposit: terms.deposit,
      signedTermMonths: applicationMonths(app, settings.minMonths),
      status: ApplicationStatus.AWAITING_PAYMENT,
      expiresAt: new Date(now.getTime() + DEPOSIT_PAY_WINDOW_MS),
    },
  });

  const invoice = await createLocalInvoice({
    kind: InvoiceKind.DEPOSIT,
    description: `Deposit ${app.room.roomType.name} — ${app.reference}`,
    amount: terms.deposit,
    dueDate: new Date(`${new Date(now.getTime() + DEPOSIT_PAY_WINDOW_MS).toISOString().slice(0, 10)}T00:00:00Z`),
    applicationId: app.id,
  });

  log.info("application terms accepted", { reference: app.reference, invoice: invoice.code });
  return NextResponse.json({ ok: true, invoice: invoice.code, amount: rp(terms.deposit) });
}
