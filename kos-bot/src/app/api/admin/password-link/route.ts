import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeHtml, ownerPostGuard } from "@/lib/admin-guard";
import { createPasswordSetupLink } from "@/lib/password-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shows the link once. It is never stored in plain form, so it cannot be shown again. */
export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const tenantId = String((await req.formData()).get("tenantId") ?? "");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return new NextResponse("not found", { status: 404 });

  const link = await createPasswordSetupLink(tenant.id);
  await prisma.auditLog.create({ data: { actor: "owner", action: "password:link", tenantId: tenant.id } });

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Link atur password</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;line-height:1.6}
code{display:block;padding:12px;background:#f3f3fa;border-radius:10px;word-break:break-all;user-select:all}</style></head>
<body><h1>Link atur password</h1>
<p>Untuk <strong>${escapeHtml(tenant.fullName)}</strong> (${escapeHtml(tenant.accountCode)}). Berlaku 24 jam dan hanya bisa dipakai sekali.
Kirim lewat WhatsApp atau SMS pribadi kakak. Link ini tidak bisa ditampilkan lagi.</p>
<code>${escapeHtml(link)}</code>
<p><a href="/admin">← Kembali ke dashboard</a></p></body></html>`;
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
