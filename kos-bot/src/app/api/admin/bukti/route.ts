import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminPostGuard, auditActor, backTo } from "@/lib/admin-guard";
import { acceptProof, rejectProof } from "@/lib/payment-proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner's decision on one transfer proof: accept (records the payment) or reject (with a reason the payer sees). */
export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const proofId = String(form.get("proofId") ?? "").slice(0, 40);
  const decision = String(form.get("decision") ?? "");
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId }, include: { invoice: { select: { code: true } } } });
  if (!proof) return backTo(req, "/admin/tagihan", "ok=already");

  const actor = await auditActor();
  if (decision === "accept") {
    const result = await acceptProof(proof.id, actor);
    return backTo(req, "/admin/tagihan", `status=verifikasi&ok=${result}`);
  }
  if (decision === "reject") {
    const reason = String(form.get("reason") ?? "");
    if (!reason.trim()) return backTo(req, `/admin/tagihan/${proof.invoice.code}`);
    const result = await rejectProof(proof.id, reason, actor);
    return backTo(req, "/admin/tagihan", `status=verifikasi&ok=${result}`);
  }
  return backTo(req, `/admin/tagihan/${proof.invoice.code}`);
}
