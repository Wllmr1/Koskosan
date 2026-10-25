import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, clearAdminCookie, logoutAdmin } from "@/lib/admin-auth";
import { sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toLogin = (req: NextRequest) => NextResponse.redirect(new URL("/admin/login", req.url), { status: 303 });

/** "Keluar": ends the session on the server too, so a copied cookie stops working. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  await logoutAdmin(req.cookies.get(ADMIN_COOKIE)?.value);
  const res = toLogin(req);
  clearAdminCookie(res);
  return res;
}

/** Old bookmarks: only a redirect. Logging out needs the POST, so another site cannot log you out. */
export async function GET(req: NextRequest) {
  return toLogin(req);
}
