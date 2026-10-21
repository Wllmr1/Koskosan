import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { readSigned, signSession } from "./crypto";

export const CHAT_COOKIE = "kos_chat";
const CHAT_TTL_MS = 30 * 86_400_000;
const ANON_ID = /^[A-Za-z0-9_-]{20,64}$/;

/** The anonymous visitor id from the signed cookie, or null (missing, tampered or expired). */
export async function readAnonId(): Promise<string | null> {
  const jar = await cookies();
  return anonIdFromCookie(jar.get(CHAT_COOKIE)?.value);
}

export function anonIdFromCookie(value: string | undefined): string | null {
  const id = readSigned(value);
  return id && ANON_ID.test(id) ? id : null;
}

export function newAnonId(): { id: string; cookie: string } {
  const id = crypto.randomBytes(24).toString("base64url");
  return { id, cookie: signSession(id, CHAT_TTL_MS) };
}

export function setChatCookie(res: NextResponse, cookie: string): void {
  res.cookies.set(CHAT_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHAT_TTL_MS / 1000,
  });
}
