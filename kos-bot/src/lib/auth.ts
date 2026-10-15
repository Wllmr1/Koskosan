import { cookies } from "next/headers";
import { verifySession } from "./crypto";

export const SESSION_COOKIE = "kos_owner";
export const SESSION_TTL_MS = 12 * 3_600_000;

export async function isOwner(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
