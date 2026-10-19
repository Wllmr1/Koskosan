import type { NextRequest } from "next/server";
import { env } from "@/env";

/**
 * True when a state-changing request comes from our own pages. Browsers send
 * Origin on every POST, so a POST without one is treated as foreign.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(env().APP_URL).origin || origin === req.nextUrl.origin;
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "0.0.0.0").trim();
}
