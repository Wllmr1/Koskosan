import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandLine, fillSlots, isActive, SITE_NAV } from "@/lib/site";

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

describe("site shell", () => {
  it("keeps the menu order", () => {
    expect(SITE_NAV.map((n) => n.label)).toEqual(["Beranda", "Kamar", "Fasilitas", "Biaya", "Lokasi", "Aturan", "FAQ"]);
  });

  it("is light only: the stylesheet has no prefers-color-scheme", () => {
    const css = readFileSync(join(process.cwd(), "src/app/rk.css"), "utf8");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("scopes every stylesheet rule under .rk", () => {
    const css = readFileSync(join(process.cwd(), "src/app/rk.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n][^{}]*)\{/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThan(50);
    for (const sel of selectors) for (const part of sel.split(",")) expect(part.trim().startsWith(".rk")).toBe(true);
  });

  it("puts the tagline under the wordmark, or the tagline alone when it is long", () => {
    expect(brandLine("Hunian butik dekat kampus")).toBe("Kost · Hunian butik dekat kampus");
    const long = "Kos mahasiswa putri dengan kontrak digital";
    expect(brandLine(long)).toBe(long);
  });
});
