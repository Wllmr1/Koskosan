import { NextRequest, NextResponse } from "next/server";
import { ApplicationStatus, InvoiceKind, RoomStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { normalizePhone, rp } from "@/lib/money";
import { putObject, validateImage } from "@/lib/storage";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { buildContractData, findApplicationByToken, onboardingAmount, roomHeldByAnother } from "@/lib/application";
import { buildContractPdf, contractHash } from "@/lib/contract";
import { createLocalInvoice, ensurePaymentUrl } from "@/lib/billing";

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
 * Step 1 of the secure flow: personal details + KTP photo.
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

  // Re-submission is allowed (they went back a step), but the room must still be free.
  if (!(await roomStillOpenFor(app.id, app.roomId))) {
    return NextResponse.json(
      { error: "Maaf, kamar ini baru saja diambil orang lain. Minta pilihan kamar lain lewat WhatsApp ya kak." },
      { status: 409 }
    );
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
      fullName: data.fullName,
      phoneE164: phone,
      dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
      idNumberEnc: encrypt(idDigits),
      idLast4: idDigits.slice(-4),
      ktpObjectKey: ktpKey,
      moveInDate: new Date(`${data.moveInDate}T00:00:00Z`),
      status: ApplicationStatus.DETAILS_SUBMITTED,
    },
  });

  // Hold the room while they read and sign.
  await prisma.room.updateMany({
    where: { id: app.roomId, status: RoomStatus.AVAILABLE },
    data: { status: RoomStatus.BOOKED },
  });

  log.info("application details submitted", { reference: app.reference });
  return NextResponse.json({ ok: true, next: "contract" });
}

const signSchema = z.object({
  token: z.string().min(20).max(64),
  signature: z.string().startsWith("data:image/png;base64,").max(600_000),
  agreed: z.literal("true"),
});

/**
 * Step 2: signature, contract PDF, and the first invoice.
 * Returns the payment URL the browser then redirects to.
 */
export async function PUT(req: NextRequest) {
  const ip = clientIp(req);
  if (await overLimit("apply-sign", ip, 20, 3_600_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = signSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Tanda tangan belum lengkap." }, { status: 400 });

  const app = await findApplicationByToken(parsed.data.token);
  if (!app) return NextResponse.json({ error: "Link sudah tidak berlaku." }, { status: 404 });
  if (!app.fullName || !app.idNumberEnc) {
    return NextResponse.json({ error: "Isi data diri dulu." }, { status: 409 });
  }

  // Already signed: just hand back the existing payment link (idempotent).
  if (app.status === ApplicationStatus.AWAITING_PAYMENT || app.status === ApplicationStatus.SIGNED) {
    const existing = await prisma.invoice.findFirst({
      where: { applicationId: app.id, status: { in: ["UNPAID", "PARTIAL"] } },
    });
    if (existing) return NextResponse.json({ ok: true, paymentUrl: await ensurePaymentUrl(existing.id) });
  }
  if (app.status === ApplicationStatus.COMPLETED) {
    return NextResponse.json({ error: "Sudah selesai." }, { status: 409 });
  }
  if (!(await roomStillOpenFor(app.id, app.roomId))) {
    return NextResponse.json({ error: "Maaf, kamar ini sudah tidak tersedia." }, { status: 409 });
  }

  const signaturePng = Buffer.from(parsed.data.signature.split(",")[1] ?? "", "base64");
  if (signaturePng.length < 200) return NextResponse.json({ error: "Tanda tangan belum terbaca." }, { status: 400 });

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const { decrypt } = await import("@/lib/crypto");
  const idNumber = decrypt(app.idNumberEnc);

  const contractData = await buildContractData(app.id, idNumber);
  const signedAt = new Date();

  const sigKey = `signatures/${app.reference}.png`;
  await putObject(sigKey, signaturePng, "image/png");

  const pdf = await buildContractPdf(contractData, signaturePng, signedAt, ip);
  const contractKey = `contracts/${app.reference}.pdf`;
  await putObject(contractKey, pdf, "application/pdf");

  const amount = onboardingAmount(contractData.monthlyRent, app.plan, settings.yearlyMonths);

  await prisma.application.update({
    where: { id: app.id },
    data: {
      signatureKey: sigKey,
      contractKey,
      contractHash: contractHash(contractData),
      signedAt,
      signedIp: ip,
      signedAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      amountDue: amount,
      status: ApplicationStatus.SIGNED,
    },
  });

  const rentMonths = app.plan === "YEARLY" ? settings.yearlyMonths : 1;
  const invoice = await createLocalInvoice({
    kind: InvoiceKind.ONBOARDING,
    description: `Pembayaran pertama kamar ${app.room.code}: sewa ${rentMonths} bulan + deposit ${rp(contractData.deposit)}`,
    amount,
    dueDate: new Date(Date.now() + 86_400_000),
    applicationId: app.id,
  });

  const paymentUrl = await ensurePaymentUrl(invoice.id);
  await prisma.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.AWAITING_PAYMENT } });

  log.info("application signed", { reference: app.reference, invoice: invoice.code });
  return NextResponse.json({ ok: true, paymentUrl, amount: rp(amount) });
}

/** The room is free, or held (BOOKED) by this very application and nobody else. */
async function roomStillOpenFor(applicationId: string, roomId: string): Promise<boolean> {
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId }, select: { status: true } });
  if (room.status !== RoomStatus.AVAILABLE && room.status !== RoomStatus.BOOKED) return false;
  return !(await roomHeldByAnother(applicationId, roomId));
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "0.0.0.0").trim();
}
