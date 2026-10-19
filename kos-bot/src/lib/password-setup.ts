import { env } from "@/env";
import { prisma } from "./prisma";
import { newToken, sha256 } from "./crypto";
import { hashPassword, passwordProblem } from "./password";

const TTL_MS = 24 * 3_600_000;
const INVALID = "Link sudah dipakai atau kedaluwarsa. Minta link baru ke pemilik kos ya kak.";

/** A single-use link the owner copies and sends to the renter. Only its hash is stored. */
export async function createPasswordSetupLink(tenantId: string): Promise<string> {
  const { raw, hash } = newToken();
  await prisma.passwordSetupToken.create({
    data: { tenantId, tokenHash: hash, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return `${env().APP_URL}/atur-password/${raw}`;
}

export async function findSetupToken(raw: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return null;
  const row = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { tenant: { select: { id: true, fullName: true, phoneE164: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Sets the password, burns every open link for this renter, and logs out all their devices. */
export async function consumePasswordSetup(
  raw: string,
  password: string,
  confirm: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await findSetupToken(raw);
  if (!row) return { ok: false, error: INVALID };

  const problem = passwordProblem(password, confirm, row.tenant.phoneE164);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);

  const now = new Date();
  // Claim the token atomically so two tabs cannot both use it.
  const claimed = await prisma.passwordSetupToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return { ok: false, error: INVALID };

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: row.tenantId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordSetupToken.updateMany({ where: { tenantId: row.tenantId, usedAt: null }, data: { usedAt: now } }),
    prisma.auditLog.create({ data: { actor: "tenant", action: "password:set", tenantId: row.tenantId } }),
  ]);
  return { ok: true };
}
