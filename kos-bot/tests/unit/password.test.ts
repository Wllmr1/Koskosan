import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("kamar-favoritku-9");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword("kamar-favoritku-9", stored)).toBe(true);
    expect(await verifyPassword("kamar-favoritku-8", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("sama-sama-saja-1")).not.toBe(await hashPassword("sama-sama-saja-1"));
  });

  it("returns false for a missing or malformed hash", async () => {
    expect(await verifyPassword("whatever-123", null)).toBe(false);
    expect(await verifyPassword("whatever-123", "md5$abc")).toBe(false);
  });

  it("enforces the rules", () => {
    expect(passwordProblem("pendek", "pendek")).toMatch(/minimal 10/);
    expect(passwordProblem("panjang-sekali-1", "panjang-sekali-2")).toMatch(/tidak sama/);
    expect(passwordProblem("081234567890", "081234567890", "+6281234567890")).toMatch(/nomor HP/);
    expect(passwordProblem("panjang-sekali-1", "panjang-sekali-1", "+6281234567890")).toBeNull();
  });
});
