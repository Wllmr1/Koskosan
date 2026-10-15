import crypto from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const PASSWORD_MIN = 10;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

/** "scrypt$<salt hex>$<hash hex>". The plain password is never stored or logged. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const key = await scrypt(password, Buffer.from(saltHex, "hex"));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Indonesian error message for the person, or null when the password is acceptable. */
export function passwordProblem(password: string, confirm: string, phoneE164?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter.`;
  if (password.length > 200) return "Password terlalu panjang.";
  if (password !== confirm) return "Kedua password tidak sama.";
  if (phoneE164) {
    const intl = phoneE164.replace(/\D/g, "");
    const local = `0${intl.slice(2)}`;
    if ([phoneE164, intl, local].includes(password)) return "Jangan pakai nomor HP sebagai password.";
  }
  return null;
}
