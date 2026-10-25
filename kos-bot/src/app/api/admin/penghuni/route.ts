import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backTo, escapeHtml, adminPostGuard, auditActor } from "@/lib/admin-guard";
import { firstIssue } from "@/lib/admin-forms";
import { addExistingTenant, parseExistingTenant } from "@/lib/admin-tenants";
import { createPasswordSetupLink } from "@/lib/password-setup";
import { deleteObject, putObject, validateImage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_MAX_BYTES = 10 * 1024 * 1024;
const fail = (req: NextRequest, message: string) => backTo(req, "/admin/penghuni/baru", `error=${encodeURIComponent(message)}`);

export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const parsed = parseExistingTenant(form);
  if (!parsed.success) return fail(req, firstIssue(parsed.error));

  // Optional files are checked by their bytes and stored privately before the account is created.
  const tag = `OLD-${crypto.randomBytes(6).toString("hex")}`;
  const stored: string[] = [];
  let contractKey: string | null = null;
  let ktpKey: string | null = null;
  try {
    const contract = form.get("contract");
    if (contract instanceof File && contract.size > 0) {
      const buf = Buffer.from(await contract.arrayBuffer());
      if (buf.byteLength > PDF_MAX_BYTES) return fail(req, "Scan kontrak maksimal 10 MB.");
      if (buf.subarray(0, 5).toString() !== "%PDF-") return fail(req, "Scan kontrak harus berupa file PDF.");
      contractKey = `contracts/${tag}.pdf`;
      await putObject(contractKey, buf, "application/pdf");
      stored.push(contractKey);
    }
    const ktp = form.get("ktp");
    if (ktp instanceof File && ktp.size > 0) {
      const buf = Buffer.from(await ktp.arrayBuffer());
      const type = validateImage(buf, ktp.type);
      ktpKey = `ktp/${tag}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
      await putObject(ktpKey, buf, type);
      stored.push(ktpKey);
    }

    const { tenant, room } = await addExistingTenant(parsed.data, contractKey, await auditActor());
    if (ktpKey) await prisma.tenant.update({ where: { id: tenant.id }, data: { ktpObjectKey: ktpKey } });
    const link = await createPasswordSetupLink(tenant.id);

    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Penghuni ditambahkan</title>
<style>:root{color-scheme:only light}body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;line-height:1.6;background:#f1e9dc;color:#2e241b}
code{display:block;padding:12px;background:#fbf8f2;border:1px solid #e2d6c4;border-radius:10px;word-break:break-all;user-select:all}</style></head>
<body><h1>Penghuni ditambahkan</h1>
<p><strong>${escapeHtml(tenant.fullName)}</strong> (${escapeHtml(tenant.accountCode)}) sekarang tercatat di kamar ${escapeHtml(room.code)}.</p>
<p>Kirim link ini ke penghuni lewat WhatsApp pribadi kakak. Dengan link ini mereka membuat password lalu bisa masuk ke halaman akun.
Berlaku 24 jam dan hanya sekali pakai. Kalau kedaluwarsa, buat link baru dari dashboard (Penghuni aktif).</p>
<code>${escapeHtml(link)}</code>
<p><a href="/admin/penghuni/baru">Tambah penghuni lain</a> · <a href="/admin">Kembali ke dashboard</a></p></body></html>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    for (const key of stored) await deleteObject(key).catch(() => undefined);
    return fail(req, (e as Error).message);
  }
}
