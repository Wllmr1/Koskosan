import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "./auth";
import { sameOrigin } from "./http";

/** Every owner-only POST starts with this. Returns the error response, or null to continue. */
export async function ownerPostGuard(req: NextRequest): Promise<NextResponse | null> {
  if (!(await isOwner())) return new NextResponse("unauthorized", { status: 401 });
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  return null;
}

/** Redirect after a form post, e.g. backTo(req, "/admin/data", "saved=1"). */
export function backTo(req: NextRequest, path: string, query = ""): NextResponse {
  return NextResponse.redirect(new URL(query ? `${path}?${query}` : path, req.url), { status: 303 });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
