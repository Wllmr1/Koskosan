import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandLine, fillSlots, heroEyebrow, heroLead, heroPhotos, isActive, pickShowcase, roman, SITE_NAV } from "@/lib/site";
import { availabilityLabel } from "@/lib/room-types";
import { niceDate } from "@/lib/money";

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

/** Selectors (comma-split) that do not start with ".rk" as a whole token. Looks at every rule, also the first one inside @media. */
function unscopedSelectors(source: string): string[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const m of css.matchAll(/(?:^|[{};])\s*([^{};@][^{};]*)\{/g)) {
    if (m[1].trim().startsWith("@")) continue;
    for (const part of m[1].split(",")) {
      if (!/^\.rk(?=$|[\s.:\[,])/.test(part.trim())) found.push(part.trim());
    }
  }
  return found;
}

describe("site shell", () => {
  it("keeps the menu order", () => {
    expect(SITE_NAV.map((n) => n.label)).toEqual(["Beranda", "Kamar", "Fasilitas", "Biaya", "Lokasi", "Aturan", "FAQ"]);
  });

  it("is light only: the stylesheet has no prefers-color-scheme", () => {
    const css = readFileSync(join(process.cwd(), "src/app/rk.css"), "utf8");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("scopes every stylesheet rule under .rk, including the first rule inside @media", () => {
    const css = readFileSync(join(process.cwd(), "src/app/rk.css"), "utf8");
    expect(css.length).toBeGreaterThan(1000);
    expect(unscopedSelectors(css)).toEqual([]);
    expect(css).toContain(".rk [hidden]");
  });

  it("the scope check catches an unscoped first rule in a media block and look-alike prefixes", () => {
    expect(unscopedSelectors("@media (max-width:640px){.foo{color:red}.rk .a{color:red}}")).toEqual([".foo"]);
    expect(unscopedSelectors(".rkfoo{color:red}.rk .a,.rk.b,.rk:hover{color:red}")).toEqual([".rkfoo"]);
  });

  it("puts the tagline under the wordmark, or the tagline alone when it is long", () => {
    expect(brandLine("Hunian butik dekat kampus")).toBe("Kost · Hunian butik dekat kampus");
    const long = "Kos mahasiswa putri dengan kontrak digital";
    expect(brandLine(long)).toBe(long);
  });
});

describe("roman numerals", () => {
  it("numbers list items", () => {
    expect([1, 2, 4, 6, 9, 12].map(roman)).toEqual(["i", "ii", "iv", "vi", "ix", "xii"]);
  });
});

describe("heroPhotos", () => {
  const covers = [
    { slug: "standar", cover: "std" },
    { slug: "vip-1", cover: "v1" },
    { slug: "standard-new", cover: null },
    { slug: "vip-a", cover: "va" },
  ];

  it("uses the property gallery when it has at least three photos", () => {
    expect(heroPhotos(["a", "b", "c", "d"], covers)).toEqual(["a", "b", "c"]);
  });

  it("otherwise uses type covers in the preferred order, skipping missing ones", () => {
    expect(heroPhotos(["a"], covers)).toEqual(["va", "v1", "std"]);
  });

  it("is empty when nothing has a photo", () => {
    expect(heroPhotos([], [{ slug: "vip-a", cover: null }])).toEqual([]);
  });
});

describe("Beranda copy", () => {
  const money = (n: number) => `Rp${n}`;

  it("uses the house eyebrow, or the address when the tagline already says it", () => {
    expect(heroEyebrow("Tinggal seperti di hotel", "Jl. A")).toBe("Hunian butik dekat kampus");
    expect(heroEyebrow(" hunian butik dekat kampus ", "Jl. A")).toBe("Jl. A");
  });

  it("builds the lead from counts and leaves out what is empty", () => {
    expect(heroLead({ facilities: 6, types: 7, cheapest: 1200000, free: 3 }, money)).toBe(
      "6 fasilitas di dalam kos. 7 tipe kamar mulai Rp1200000 per bulan. 3 kamar tersedia sekarang.",
    );
    expect(heroLead({ facilities: 0, types: 2, cheapest: 5, free: 0 }, money)).toBe("2 tipe kamar mulai Rp5 per bulan.");
    expect(heroLead({ facilities: 0, types: 0, cheapest: 0, free: 0 }, money)).toBe("");
  });

  it("shows Standard New then VIP A, skipping a missing one", () => {
    const t = (slug: string) => ({ slug });
    expect(pickShowcase([t("vip-a"), t("deluxe"), t("standard-new")]).map((x) => x.slug)).toEqual(["standard-new", "vip-a"]);
    expect(pickShowcase([t("deluxe"), t("vip-a")]).map((x) => x.slug)).toEqual(["vip-a"]);
    expect(pickShowcase([t("deluxe")])).toEqual([]);
  });

  it("labels a full showcase type with the date it opens", () => {
    const label = availabilityLabel({ free: 0, nextFree: new Date("2027-01-15T00:00:00Z") });
    expect(label).toBe(`Penuh · kosong mulai ${niceDate(new Date("2027-01-15T00:00:00Z"))}`);
    expect(availabilityLabel({ free: 2, nextFree: null })).toBe("2 kamar tersedia");
  });
});
