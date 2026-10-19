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

/**
 * The visitor's address as our own proxy saw it. X-Real-IP is set by the proxy
 * (nginx, Vercel). Otherwise the LAST X-Forwarded-For hop: proxies append the
 * real address, while anything earlier in the list can be typed by the visitor.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "0.0.0.0";
}
