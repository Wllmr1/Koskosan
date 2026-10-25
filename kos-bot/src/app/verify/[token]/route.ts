import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/crypto";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opening this link is what proves a WhatsApp number belongs to the renter.
 * Single use, 10 minutes, and the raw token is never stored anywhere.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return html("Link tidak valid.", false);

  const row = await prisma.verifyToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { contact: true },
  });

  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return html("Link sudah dipakai atau kedaluwarsa. Minta link baru lewat WhatsApp ya.", false);
  }

  await prisma.$transaction([
    prisma.verifyToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.contact.update({ where: { id: row.contactId }, data: { verifiedAt: new Date() } }),
    prisma.auditLog.create({ data: { actor: "tenant", action: "verified", contactId: row.contactId } }),
  ]);

  log.info("contact verified", { contactId: row.contactId });
  return html("Akun kakak sudah terverifikasi ✅ Silakan kembali ke WhatsApp.", true);
}

function html(message: string, ok: boolean) {
  const body = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifikasi akun</title>
<style>
:root{color-scheme:only light}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;
font-family:Jost,Futura,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
.card{max-width:420px;text-align:center}
.icon{width:64px;height:64px;display:grid;place-items:center;margin:0 auto 22px;font-size:28px;
border:1px solid ${ok ? "#1E6B45" : "#A42A3F"};color:${ok ? "#1E6B45" : "#A42A3F"}}
h1{font-family:"Bodoni Moda",Didot,Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;margin:0 0 12px}
p{margin:0;color:#5A5753;font-size:16px;line-height:1.7}
</style></head><body><div class="card"><div class="icon">${ok ? "✓" : "!"}</div>
<h1>${ok ? "Berhasil" : "Tidak berhasil"}</h1><p>${message}</p></div></body></html>`;
  return new NextResponse(body, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
