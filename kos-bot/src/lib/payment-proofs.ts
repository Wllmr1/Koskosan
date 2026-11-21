import { ApplicationStatus, InvoiceKind, InvoiceStatus, ProofStatus } from "@prisma/client";
import type { Invoice, PaymentProof } from "@prisma/client";
import { prisma } from "./prisma";
import { log } from "./logger";
import { putObject, validateImage } from "./storage";
import { notifyOwner } from "./notify";
import { recordPayment } from "./payments";
import { rp } from "./money";
import { deliverToContact, deliverToRenter } from "./chat/deliver";
import { sendTemplate, waIdFromE164 } from "./whatsapp";
import { whatsappEnabled } from "./features";

const DAY_MS = 86_400_000;
/** Time to make the deposit transfer after ticking the terms; the room is held meanwhile. */
export const DEPOSIT_PAY_WINDOW_MS = 3 * DAY_MS;
/** Once proof is in, the application page stays reachable while the owner checks it and the renter makes an account. */
const AFTER_PROOF_TTL_MS = 60 * DAY_MS;

export const KIND_LABEL: Record<InvoiceKind, string> = {
  DEPOSIT: "Deposit",
  RENT: "Sewa",
  ONBOARDING: "Sewa + deposit",
  UTILITY_OVERAGE: "Listrik",
  GUEST: "Tamu",
  LATE_FEE: "Denda",
  SERVICE: "Layanan",
};

/** Where a bill stands, as both the owner and the renter see it. */
export type BillState = "paid" | "pending" | "rejected" | "late" | "due" | "closed";

/**
 * - paid: the money is in (owner accepted the proof, or paid online before)
 * - pending: proof uploaded, the owner has not checked it yet
 * - rejected: the last proof was turned down and nothing newer was sent
 * - late: unpaid and past the due date (from the day after it)
 * - due: unpaid, not yet late
 */
export function billState(
  inv: Pick<Invoice, "status" | "dueDate">,
  proofs: Pick<PaymentProof, "status" | "uploadedAt">[],
  now = new Date()
): BillState {
  if (inv.status === InvoiceStatus.PAID) return "paid";
  if (inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.EXPIRED) return "closed";
  const latest = [...proofs].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
  if (latest?.status === ProofStatus.SUBMITTED) return "pending";
  if (isLate(inv.dueDate, now)) return "late";
  if (latest?.status === ProofStatus.REJECTED) return "rejected";
  return "due";
}

/** Late from the day after the due date (dates are stored as UTC midnight). */
export function isLate(dueDate: Date, now = new Date()): boolean {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dueDate.getTime() < today;
}

export function daysLate(dueDate: Date, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((today - dueDate.getTime()) / DAY_MS));
}

export class ProofError extends Error {}

/**
 * Stores a transfer receipt for one invoice. A newer upload replaces one the
 * owner has not looked at yet. Callers have already checked that the person
 * uploading is allowed to pay this invoice.
 */
export async function submitProof(invoiceId: string, file: { buffer: Buffer; type: string }) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { application: true, lease: { include: { tenant: true, room: true } }, guestStay: { include: { tenant: true } } },
  });
  if (invoice.status === InvoiceStatus.PAID) throw new ProofError("Tagihan ini sudah lunas.");
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.EXPIRED) {
    throw new ProofError("Tagihan ini sudah tidak berlaku.");
  }

  let contentType: string;
  try {
    contentType = validateImage(file.buffer, file.type);
  } catch (e) {
    throw new ProofError((e as Error).message);
  }
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const fileKey = `proofs/${invoice.code}-${Date.now()}.${ext}`;
  await putObject(fileKey, file.buffer, contentType);

  const now = new Date();
  const proof = await prisma.$transaction(async (tx) => {
    await tx.paymentProof.updateMany({
      where: { invoiceId, status: ProofStatus.SUBMITTED },
      data: { status: ProofStatus.REJECTED, reviewedAt: now, reviewedBy: "system", rejectReason: "Diganti bukti yang lebih baru." },
    });
    const created = await tx.paymentProof.create({ data: { invoiceId, fileKey } });
    if (invoice.application && invoice.kind === InvoiceKind.DEPOSIT) {
      await tx.application.update({
        where: { id: invoice.application.id },
        data: { status: ApplicationStatus.PROOF_SUBMITTED, expiresAt: new Date(now.getTime() + AFTER_PROOF_TTL_MS) },
      });
    }
    return created;
  });

  const payer = invoice.application?.fullName ?? invoice.lease?.tenant.fullName ?? invoice.guestStay?.tenant.fullName ?? "-";
  const where = invoice.lease ? ` · ${invoice.lease.room.code}` : invoice.application ? ` · ${invoice.application.reference}` : "";
  await notifyOwner({
    dedupeKey: `proof:${proof.id}`,
    title: "Bukti transfer masuk",
    subject: `Bukti transfer ${KIND_LABEL[invoice.kind].toLowerCase()} dari ${payer}`,
    body: `${payer}${where} mengirim bukti transfer untuk ${invoice.code} (${invoice.description}), ${rp(invoice.amount - invoice.amountPaid)}.\n\nCek dan terima atau tolak di dashboard: Tagihan → Perlu verifikasi.`,
    short: `Bukti transfer ${KIND_LABEL[invoice.kind].toLowerCase()} ${rp(invoice.amount - invoice.amountPaid)} dari ${payer.split(" ")[0]} — perlu dicek.`,
  });
  log.info("payment proof submitted", { invoice: invoice.code });
  return proof;
}

/** Owner accepted: the transfer becomes a Payment through the same path every payment takes. */
export async function acceptProof(proofId: string, actor: string): Promise<"accepted" | "already"> {
  const now = new Date();
  const claimed = await prisma.paymentProof.updateMany({
    where: { id: proofId, status: ProofStatus.SUBMITTED },
    data: { status: ProofStatus.ACCEPTED, reviewedAt: now, reviewedBy: actor },
  });
  if (claimed.count !== 1) return "already";

  const proof = await prisma.paymentProof.findUniqueOrThrow({ where: { id: proofId }, include: { invoice: true } });
  await recordPayment({
    invoiceCode: proof.invoice.code,
    eventId: `proof:${proof.id}`,
    amount: proof.invoice.amount - proof.invoice.amountPaid,
    method: "transfer bank",
    paidAt: proof.uploadedAt,
    raw: { proofId: proof.id, acceptedBy: actor },
  });
  await prisma.auditLog.create({ data: { actor, action: "proof:accept", meta: { invoice: proof.invoice.code } as never } });
  return "accepted";
}

/** Owner turned it down: the payer hears why and can upload again. */
export async function rejectProof(proofId: string, reason: string, actor: string): Promise<"rejected" | "already"> {
  const now = new Date();
  const clean = reason.trim().slice(0, 300) || "Bukti transfer tidak sesuai.";
  const claimed = await prisma.paymentProof.updateMany({
    where: { id: proofId, status: ProofStatus.SUBMITTED },
    data: { status: ProofStatus.REJECTED, reviewedAt: now, reviewedBy: actor, rejectReason: clean },
  });
  if (claimed.count !== 1) return "already";

  const proof = await prisma.paymentProof.findUniqueOrThrow({
    where: { id: proofId },
    include: { invoice: { include: { application: true, lease: true, guestStay: true } } },
  });
  const inv = proof.invoice;
  await prisma.auditLog.create({ data: { actor, action: "proof:reject", meta: { invoice: inv.code, reason: clean } as never } });

  const text = `Bukti transfer untuk *${inv.code}* (${inv.description}) belum bisa kami terima: ${clean}\n\nSilakan kirim ulang bukti transfernya lewat website ya kak.`;
  if (inv.application && inv.kind === InvoiceKind.DEPOSIT) {
    const app = await prisma.application.update({
      where: { id: inv.application.id },
      data: { status: ApplicationStatus.AWAITING_PAYMENT, expiresAt: new Date(now.getTime() + DEPOSIT_PAY_WINDOW_MS) },
    });
    if (app.contactId) await deliverToContact(app.contactId, text);
    await textApplicantOnWhatsApp(app.phoneE164, "payment_rejected", [app.fullName?.split(" ")[0] ?? "kak", inv.code, clean]);
  } else {
    const tenantId = inv.lease?.tenantId ?? inv.guestStay?.tenantId;
    if (tenantId) await deliverToRenter(tenantId, text, [{ kind: "link", label: "Buka akun", path: "/akun" }]);
  }
  return "rejected";
}

/**
 * Someone who applied on the website has no WhatsApp chat with us yet, so the
 * only way to reach them later is an approved template to the number they gave.
 */
export async function textApplicantOnWhatsApp(phoneE164: string | null, template: string, params: string[]) {
  if (!phoneE164 || !whatsappEnabled()) return;
  try {
    await sendTemplate(waIdFromE164(phoneE164), template, "id", params);
  } catch (e) {
    log.warn("applicant template failed", { template, message: String(e) });
  }
}
