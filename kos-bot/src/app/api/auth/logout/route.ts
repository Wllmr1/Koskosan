import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/http";
import { clearRenterCookie } from "@/lib/renter-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("forbidden", { status: 403 });
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  clearRenterCookie(res);
  return res;
}
