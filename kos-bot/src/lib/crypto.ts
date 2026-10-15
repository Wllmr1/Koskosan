import crypto from "node:crypto";
import { env } from "@/env";

/**
 * AES-256-GCM for KTP numbers at rest.
 * Format: <iv hex>:<auth tag hex>:<ciphertext hex>
 *
 * The key lives only in the environment, never in the database, so a dump of
 * the database alone does not expose a single ID number.
 */
export function encrypt(plain: string): string {
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), ct.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, ctHex] = payload.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed ciphertext");
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}

/** A URL-safe secret plus the hash we actually store. */
export function newToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Constant-time compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Display-safe masks. Never log or send the full value. */
export const maskId = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length < 8 ? "••••" : `${d.slice(0, 4)}${"•".repeat(8)}${d.slice(-4)}`;
};

export const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length < 8 ? "••••" : `${d.slice(0, 4)}${"•".repeat(4)}${d.slice(-4)}`;
};

/** Signed cookie value for the owner dashboard. */
export function signSession(payload: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const body = `${payload}.${exp}`;
  const mac = crypto.createHmac("sha256", env().SESSION_SECRET).update(body).digest("hex");
  return `${body}.${mac}`;
}

export function verifySession(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 3) return false;
  const [payload, exp, mac] = parts;
  const expected = crypto.createHmac("sha256", env().SESSION_SECRET).update(`${payload}.${exp}`).digest("hex");
  if (!safeEqual(mac, expected)) return false;
  return Number(exp) > Date.now();
}
