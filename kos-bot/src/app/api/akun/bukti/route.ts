import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RENTER_COOKIE, renterFromCookie } from "@/lib/renter-auth";
import { ProofError, submitProof } from "@/lib/payment-proofs";
import { overLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A logged-in renter uploads the transfer receipt for one of their own bills. Nobody else's, ever. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const renter = await renterFromCookie(req.cookies.get(RENTER_COOKIE)?.value);
  if (!renter) return NextResponse.json({ error: "Masuk dulu ya kak." }, { status: 401 });
  if (await overLimit("akun-proof", renter.id, 20, 3_600_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  const form = await req.formData();
  const code = String(form.get("invoice") ?? "").toUpperCase().slice(0, 40);
  const invoice = await prisma.invoice.findFirst({
    where: { code, OR: [{ lease: { tenantId: renter.id } }, { guestStay: { tenantId: renter.id } }] },
  });
  if (!invoice) return NextResponse.json({ error: "Tagihan tidak ditemukan." }, { status: 404 });

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
