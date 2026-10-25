import { NextRequest, NextResponse } from "next/server";
import { actorOf, currentAdmin } from "./admin-auth";
import { sameOrigin } from "./http";

/** Every dashboard POST starts with this. Returns the error response, or null to continue. */
export async function adminPostGuard(req: NextRequest): Promise<NextResponse | null> {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  if (!(await currentAdmin())) return new NextResponse("unauthorized", { status: 401 });
  return null;
}

/** Same, but only the owner may continue (e.g. adding or disabling admins). */
export async function ownerPostGuard(req: NextRequest): Promise<NextResponse | null> {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  const who = await currentAdmin();
  if (!who) return new NextResponse("unauthorized", { status: 401 });
  if (!who.isOwner) return new NextResponse("forbidden", { status: 403 });
  return null;
}

/** Who to name in the audit log for the current request ("owner" or "admin:<email>"). */
export async function auditActor(): Promise<string> {
  const who = await currentAdmin();
  return who ? actorOf(who) : "unknown";
}

/** Redirect after a form post, e.g. backTo(req, "/admin/data", "saved=1"). */
export function backTo(req: NextRequest, path: string, query = ""): NextResponse {
  return NextResponse.redirect(new URL(query ? `${path}?${query}` : path, req.url), { status: 303 });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
