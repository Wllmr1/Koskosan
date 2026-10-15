import { describe, expect, it } from "vitest";
import { readSigned, signSession } from "@/lib/crypto";

describe("signed values", () => {
  it("round-trips a payload", () => {
    expect(readSigned(signSession("abc:1", 60_000))).toBe("abc:1");
  });

  it("rejects a tampered payload", () => {
    const [, exp, mac] = signSession("abc:1", 60_000).split(".");
    expect(readSigned(`abd:1.${exp}.${mac}`)).toBeNull();
  });

  it("rejects an expired value", () => {
    expect(readSigned(signSession("abc", -1))).toBeNull();
  });

  it("rejects garbage", () => {
    expect(readSigned(undefined)).toBeNull();
    expect(readSigned("x.y")).toBeNull();
  });

  it("refuses payloads containing a dot", () => {
    expect(() => signSession("a.b", 60_000)).toThrow();
  });
});
