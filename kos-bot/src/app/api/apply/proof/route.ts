import { NextRequest, NextResponse } from "next/server";
import { ApplicationStatus, InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findApplicationByToken, findApplicationByUploadToken } from "@/lib/application";
import { ProofError, submitProof } from "@/lib/payment-proofs";
import { overLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 4: the deposit transfer receipt. Reached from the application page
 * (its token) or from the link the assistant sends with the bank details
 * (an upload token). Either way it only ever attaches to that application's
 * own deposit invoice.
 */
export async function POST(req: NextRequest) {
  if (await overLimit("apply-proof", clientIp(req), 10, 3_600_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const upload = String(form.get("upload") ?? "");
  const app = token ? await findApplicationByToken(token) : upload ? await findApplicationByUploadToken(upload) : null;
  if (!app) return NextResponse.json({ error: "Link sudah tidak berlaku." }, { status: 404 });
  if (app.status !== ApplicationStatus.AWAITING_PAYMENT && app.status !== ApplicationStatus.PROOF_SUBMITTED) {
    return NextResponse.json({ error: "Pendaftaran ini tidak sedang menunggu bukti transfer." }, { status: 409 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { applicationId: app.id, kind: InvoiceKind.DEPOSIT, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
  });
  if (!invoice) return NextResponse.json({ error: "Tagihan deposit tidak ditemukan." }, { status: 404 });

  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pilih foto atau screenshot bukti transfer dulu." }, { status: 400 });
  }
  try {
    await submitProof(invoice.id, { buffer: Buffer.from(await file.arrayBuffer()), type: file.type });
  } catch (e) {
    if (e instanceof ProofError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
