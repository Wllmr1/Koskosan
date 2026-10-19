import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { readSigned, signSession } from "./crypto";

export const RENTER_COOKIE = "kos_renter";
const RENTER_TTL_MS = 7 * 86_400_000;

export type Renter = { id: string; fullName: string };

/** "<tenantId>:<sessionVersion>", signed. Bumping sessionVersion logs out every device. */
export function renterCookieValue(tenantId: string, sessionVersion: number): string {
  return signSession(`${tenantId}:${sessionVersion}`, RENTER_TTL_MS);
}

export async function renterFromCookie(value: string | undefined): Promise<Renter | null> {
  const payload = readSigned(value);
  if (!payload) return null;
  const [id, version] = payload.split(":");
  if (!id || !version) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, fullName: true, sessionVersion: true },
  });
  if (!tenant || String(tenant.sessionVersion) !== version) return null;
  return { id: tenant.id, fullName: tenant.fullName };
}

export async function currentRenter(): Promise<Renter | null> {
  const jar = await cookies();
  return renterFromCookie(jar.get(RENTER_COOKIE)?.value);
}

export function setRenterCookie(res: NextResponse, value: string): void {
  res.cookies.set(RENTER_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RENTER_TTL_MS / 1000,
  });
}

export function clearRenterCookie(res: NextResponse): void {
  res.cookies.set(RENTER_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
