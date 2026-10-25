import { NextRequest, NextResponse } from "next/server";
import { clientIp, sameOrigin } from "@/lib/http";
import { escapeHtml } from "@/lib/admin-guard";
import { SETUP_INVALID, consumeAdminSetup, findAdminSetup } from "@/lib/admin-auth";
import { PASSWORD_MIN } from "@/lib/password";
import { LIMITS, overLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The form again, with the error. Answered directly instead of redirecting, so
 * the token never travels in a Location header; not cached, no referrer.
 */
async function formAgain(token: string, error: string) {
  const row = error === SETUP_INVALID ? null : await findAdminSetup(token);
  const body = row
    ? `<form method="post" action="/api/admin/atur-password">
<h1>Atur password admin</h1>
<p>Untuk ${escapeHtml(row.admin.name)} (${escapeHtml(row.admin.email)}). Minimal ${PASSWORD_MIN} karakter.</p>
<p class="bad" role="alert">${escapeHtml(error)}</p>
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="password">Password baru</label>
<input id="password" name="password" type="password" autocomplete="new-password" minlength="${PASSWORD_MIN}" required>
<label for="passwordConfirm">Ulangi password</label>
<input id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="${PASSWORD_MIN}" required>
<button type="submit">Simpan</button></form>`
    : `<h1>Link tidak berlaku</h1><p>${escapeHtml(SETUP_INVALID)}</p>`;
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Atur password admin</title>
<style>:root{color-scheme:only light}body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 20px;line-height:1.6;background:#f1e9dc;color:#2e241b}
label{display:block;font-weight:600;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #e2d6c4;border-radius:10px;background:#fbf8f2}
button{margin-top:16px;width:100%;padding:11px;border:0;border-radius:10px;background:#2e241b;color:#fbf8f2;font-weight:600}.bad{color:#a33a2a}</style></head>
<body>${body}</body></html>`;
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

/** A helper chooses their password from the one-time link the owner sent them. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  if (await overLimit("admin-setup", clientIp(req), LIMITS.adminSetup.limit, LIMITS.adminSetup.windowMs)) {
    return new NextResponse("Terlalu banyak percobaan. Coba lagi nanti.", { status: 429 });
  }

  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const result = await consumeAdminSetup(token, String(form.get("password") ?? ""), String(form.get("passwordConfirm") ?? ""));
  if (!result.ok) return formAgain(token, result.error);
  return NextResponse.redirect(new URL("/admin/login?ready=1", req.url), { status: 303 });
}
