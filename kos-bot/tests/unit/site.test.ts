import { describe, expect, it } from "vitest";
import { fillSlots, isActive, SITE_NAV } from "@/lib/site";

describe("site navigation", () => {
  it("lists the seven pages in menu order", () => {
    expect(SITE_NAV.map((n) => n.href)).toEqual(["/", "/kamar", "/fasilitas", "/biaya", "/lokasi", "/aturan", "/faq"]);
  });

  it("highlights Beranda only on the home page", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/kamar", "/")).toBe(false);
  });

  it("highlights Kamar on the room list and on every room page", () => {
    expect(isActive("/kamar", "/kamar")).toBe(true);
    expect(isActive("/kamar/A-101", "/kamar")).toBe(true);
    expect(isActive("/kamarku", "/kamar")).toBe(false);
  });
});

describe("photo slots", () => {
  it("pads with placeholders up to the slot count", () => {
    expect(fillSlots(["a"], 3)).toEqual(["a", null, null]);
  });

  it("shows every real photo even when there are more than the slots", () => {
    expect(fillSlots(["a", "b", "c"], 2)).toEqual(["a", "b", "c"]);
  });

  it("is all placeholders when there are no photos", () => {
    expect(fillSlots([], 2)).toEqual([null, null]);
  });
});
