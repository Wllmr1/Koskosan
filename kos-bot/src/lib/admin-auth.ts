import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "./prisma";
import { newToken, readSigned, safeEqual, sha256, signSession } from "./crypto";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

export const ADMIN_COOKIE = "kos_admin";
/** A dashboard login ends after this long without activity… */
export const ADMIN_IDLE_MS = 30 * 60_000;
/** …and after this long in any case. */
export const ADMIN_MAX_MS = 4 * 3_600_000;
const SETUP_TTL_MS = 24 * 3_600_000;

export type AdminIdentity = { sessionId: string; isOwner: boolean; adminId: string | null; name: string; email: string };

const norm = (email: string) => email.trim().toLowerCase();

/**
 * Which ADMIN_PASSWORD an owner session was opened with: an HMAC keyed with the
 * session secret, never the password itself. A new password ends old sessions.
 */
const ownerKey = () =>
  crypto.createHmac("sha256", env().SESSION_SECRET).update(`owner-password:${env().ADMIN_PASSWORD}`).digest("hex").slice(0, 32);

// Checked when nothing matches, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

/**
 * Email + password. The owner is OWNER_EMAIL + ADMIN_PASSWORD from the
 * environment; everyone else is an Admin row with their own password.
 * Returns the cookie value for a new session, or null — never why it failed.
 */
export async function loginAdmin(email: string, password: string): Promise<{ cookie: string; identity: AdminIdentity } | null> {
  const e = norm(email).slice(0, 200);
  const pw = password.slice(0, 200);

  let adminId: string | null = null;
  let name = env().OWNER_NAME;
  if (safeEqual(e, norm(env().OWNER_EMAIL)) && safeEqual(pw, env().ADMIN_PASSWORD)) {
    // the owner
  } else {
    const admin = await prisma.admin.findUnique({ where: { email: e } });
    const ok = admin?.passwordHash
      ? await verifyPassword(pw, admin.passwordHash)
      : (await verifyPassword(pw, await (dummyHash ??= hashPassword("not-a-real-password"))), false);
    if (!admin || !ok || admin.disabled) return null;
    adminId = admin.id;
    name = admin.name;
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  }

  const session = await prisma.adminSession.create({ data: { adminId, ownerKey: adminId === null ? ownerKey() : null } });
  return {
    cookie: signSession(session.id, ADMIN_MAX_MS),
    identity: { sessionId: session.id, isOwner: adminId === null, adminId, name, email: e },
  };
}

/** Who is logged in, or null. Also enforces the idle and maximum timeouts and records activity. */
export async function adminFromCookie(value: string | undefined, now = new Date()): Promise<AdminIdentity | null> {
  const id = readSigned(value);
  if (!id) return null;
  const session = await prisma.adminSession.findUnique({ where: { id }, include: { admin: true } });
  if (!session) return null;

  const expired =
    now.getTime() - session.lastSeenAt.getTime() > ADMIN_IDLE_MS || now.getTime() - session.createdAt.getTime() > ADMIN_MAX_MS;
  const revoked = session.admin
    ? session.admin.disabled || !session.admin.passwordHash
    : !safeEqual(session.ownerKey ?? "", ownerKey());
  if (expired || revoked) {
    await prisma.adminSession.deleteMany({ where: { id } });
    return null;
  }

  // Count this request as activity, without a write on every single click.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.adminSession.update({ where: { id }, data: { lastSeenAt: now } });
  }
  return session.admin
    ? { sessionId: id, isOwner: false, adminId: session.admin.id, name: session.admin.name, email: session.admin.email }
    : { sessionId: id, isOwner: true, adminId: null, name: env().OWNER_NAME, email: norm(env().OWNER_EMAIL) };
}

export async function currentAdmin(): Promise<AdminIdentity | null> {
  const jar = await cookies();
  return adminFromCookie(jar.get(ADMIN_COOKIE)?.value);
}

export async function logoutAdmin(value: string | undefined) {
  const id = readSigned(value);
  if (id) await prisma.adminSession.deleteMany({ where: { id } });
}

/** No maxAge: the browser forgets it when closed. The server-side session times out on its own. */
export function setAdminCookie(res: NextResponse, value: string) {
  res.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** How this admin appears in the audit log. */
export const actorOf = (who: AdminIdentity) => (who.isOwner ? "owner" : `admin:${who.email}`);

/** Why adding a helper failed, by the short code the Kelola admin page shows it under. */
export const ADMIN_ERRORS = {
  email: "Email tidak valid.",
  name: "Isi nama admin.",
  owner: "Itu email pemilik, yang sudah bisa masuk.",
  taken: "Email ini sudah terdaftar sebagai admin.",
} as const;

/** Owner adds a helper. They get a single-use link to choose their own password. */
export async function createAdmin(input: { name: string; email: string }) {
  const email = norm(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(ADMIN_ERRORS.email);
  if (name.length < 2) throw new Error(ADMIN_ERRORS.name);
  if (email === norm(env().OWNER_EMAIL)) throw new Error(ADMIN_ERRORS.owner);
  if (await prisma.admin.findUnique({ where: { email } })) throw new Error(ADMIN_ERRORS.taken);

  const admin = await prisma.admin.create({ data: { email, name } });
  return { admin, link: await adminSetupLink(admin.id) };
}

export async function adminSetupLink(adminId: string): Promise<string> {
  const { raw, hash } = newToken();
  await prisma.adminSetupToken.create({ data: { adminId, tokenHash: hash, expiresAt: new Date(Date.now() + SETUP_TTL_MS) } });
  return `${env().APP_URL}/admin/atur-password/${raw}`;
}

export async function findAdminSetup(raw: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return null;
  const row = await prisma.adminSetupToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { admin: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.admin.disabled) return null;
  return row;
}

/** Shown for a used, expired or unknown setup link (and for a switched-off admin). */
export const SETUP_INVALID = "Link sudah dipakai atau kedaluwarsa. Minta link baru ke pemilik.";

/** Sets the password, burns every open link, and ends any existing session of this admin. */
export async function consumeAdminSetup(raw: string, password: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const invalid = { ok: false as const, error: SETUP_INVALID };
  const row = await findAdminSetup(raw);
  if (!row) return invalid;
  const problem = passwordProblem(password, confirm);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);

  const claimed = await prisma.adminSetupToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return invalid;
  await prisma.$transaction([
    prisma.admin.update({ where: { id: row.adminId }, data: { passwordHash } }),
    prisma.adminSetupToken.updateMany({ where: { adminId: row.adminId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.adminSession.deleteMany({ where: { adminId: row.adminId } }),
  ]);
  return { ok: true };
}

/**
 * Disabling ends every session of that admin immediately and burns their open
 * setup links, so switching them back on does not revive an old link.
 */
export async function setAdminDisabled(adminId: string, disabled: boolean) {
  await prisma.$transaction([
    prisma.admin.update({ where: { id: adminId }, data: { disabled } }),
    ...(disabled
      ? [
          prisma.adminSession.deleteMany({ where: { adminId } }),
          prisma.adminSetupToken.updateMany({ where: { adminId, usedAt: null }, data: { usedAt: new Date() } }),
        ]
      : []),
  ]);
}
