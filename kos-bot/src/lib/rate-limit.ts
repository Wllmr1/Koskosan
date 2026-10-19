import { prisma } from "./prisma";

/**
 * DB-backed sliding counter. No Redis needed at kos scale.
 * Returns true when the caller is over the limit.
 */
export async function overLimit(scope: string, id: string, limit: number, windowMs: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `${scope}:${id}:${bucket}`;
  const row = await prisma.rateCounter.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((bucket + 2) * windowMs) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count > limit;
}

/** True when this key has already used its allowance in the current window. Reads only. */
export async function atLimit(scope: string, id: string, limit: number, windowMs: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / windowMs);
  const row = await prisma.rateCounter.findUnique({
    where: { key: `${scope}:${id}:${bucket}` },
    select: { count: true },
  });
  return (row?.count ?? 0) >= limit;
}

export const LIMITS = {
  /** messages a single WhatsApp number may send per minute */
  waPerMinute: { limit: 12, windowMs: 60_000 },
  /** messages a single WhatsApp number may send per day — caps token spend */
  waPerDay: { limit: 120, windowMs: 86_400_000 },
  /** verification links per contact per 15 minutes */
  verifyLinks: { limit: 3, windowMs: 15 * 60_000 },
  /** application form submissions per IP per hour */
  applySubmit: { limit: 20, windowMs: 3_600_000 },
  /** admin login attempts per IP per 15 minutes */
  adminLogin: { limit: 8, windowMs: 15 * 60_000 },
  /** failed renter logins per phone and per IP per 15 minutes */
  renterLogin: { limit: 5, windowMs: 15 * 60_000 },
} as const;
