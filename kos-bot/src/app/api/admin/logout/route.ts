import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, clearAdminCookie, logoutAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ends the session on the server too, so a copied cookie stops working. */
async function logout(req: NextRequest) {
  await logoutAdmin(req.cookies.get(ADMIN_COOKIE)?.value);
  const res = NextResponse.redirect(new URL("/admin/login", req.url), { status: 303 });
  clearAdminCookie(res);
  return res;
}

export const GET = logout;
export const POST = logout;
