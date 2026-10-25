import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { backTo, escapeHtml, ownerPostGuard, auditActor } from "@/lib/admin-guard";
import { ADMIN_ERRORS, adminSetupLink, createAdmin, setAdminDisabled } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The setup link, shown once. It is stored only as a hash, so it is never put
 * in a redirect URL, the audit log or the server log — only in this page.
 */
function linkPage(name: string, link: string) {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Link admin</title>
<style>:root{color-scheme:only light}body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;line-height:1.6;background:#f1e9dc;color:#2e241b}
code{display:block;padding:12px;background:#fbf8f2;border:1px solid #e2d6c4;border-radius:10px;word-break:break-all;user-select:all}</style></head>
<body><h1>Link atur password admin</h1>
<p>Kirim link ini ke ${escapeHtml(name)} lewat WhatsApp. Berlaku 24 jam, sekali pakai.</p>
<code>${escapeHtml(link)}</code>
<p>Link ini tidak bisa ditampilkan lagi. Kalau hilang, buat link baru.</p>
<p><a href="/admin/admin">Kembali ke Kelola admin</a></p></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** Owner only: add a helper, make a new setup link, switch a helper off or back on. */
export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  const back = (query: string) => backTo(req, "/admin/admin", query);
  const audit = async (admin: { id: string; email: string }) =>
    prisma.auditLog.create({ data: { actor: await auditActor(), action: `admin:${op}`, meta: { adminId: admin.id, email: admin.email } as never } });

  if (op === "create") {
    try {
      const { admin, link } = await createAdmin({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") });
      await audit(admin);
      return linkPage(admin.name, link);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return back("error=taken");
      const code = Object.entries(ADMIN_ERRORS).find(([, message]) => message === (e as Error).message)?.[0];
      if (code) return back(`error=${code}`);
      throw e;
    }
  }

  if (op !== "link" && op !== "disable" && op !== "enable") return back("error=op");
  const admin = await prisma.admin.findUnique({ where: { id: String(form.get("id") ?? "") } });
  if (!admin) return back("error=notfound");

  if (op === "link") {
    // A switched-off admin's link would not open anyway.
    if (admin.disabled) return back("error=disabled");
    const link = await adminSetupLink(admin.id);
    await audit(admin);
    return linkPage(admin.name, link);
  }
  await setAdminDisabled(admin.id, op === "disable");
  await audit(admin);
  return back("saved=1");
}
