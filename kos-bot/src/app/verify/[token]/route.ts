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
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1e9dc;color:#2e241b;
font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
.card{background:#fbf8f2;border:1px solid #e2d6c4;border-radius:20px;padding:36px 28px;max-width:420px;text-align:center}
.icon{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;font-size:30px;
background:${ok ? "#e3f4eb" : "#fbe9ec"};color:${ok ? "#1f7a4d" : "#b23046"}}
h1{font-size:19px;margin:0 0 8px}p{margin:0;color:#5e5144;font-size:15px;line-height:1.6}
</style></head><body><div class="card"><div class="icon">${ok ? "✓" : "!"}</div>
<h1>${ok ? "Berhasil" : "Tidak berhasil"}</h1><p>${message}</p></div></body></html>`;
  return new NextResponse(body, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
