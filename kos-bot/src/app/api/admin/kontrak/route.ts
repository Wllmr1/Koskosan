import { NextRequest } from "next/server";
import { adminPostGuard, auditActor, backTo } from "@/lib/admin-guard";
import { OnboardingError, recordSignedContract } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Kontrak sudah ditandatangani": the paper contract is signed, the pending lease becomes active. */
export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const leaseId = String(form.get("leaseId") ?? "").slice(0, 40);
  const file = form.get("scan");
  const scan = file instanceof File && file.size > 0 ? { buffer: Buffer.from(await file.arrayBuffer()) } : null;
  try {
    await recordSignedContract(leaseId, scan, await auditActor());
  } catch (e) {
    if (e instanceof OnboardingError) return backTo(req, "/admin/pendaftaran", `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  return backTo(req, "/admin/pendaftaran", "ok=signed");
}
