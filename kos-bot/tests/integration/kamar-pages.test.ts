import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { isoDateOrNull, planOrNull, queryString, resolveKamarPath } from "@/lib/room-types";
import { makeRoom } from "../helpers";

afterAll(() => prisma.$disconnect());

describe("resolveKamarPath", () => {
  it("opens a room type by its slug", async () => {
    const room = await makeRoom();
    const r = await resolveKamarPath(room.roomType.slug);
    expect(r?.kind).toBe("type");
    if (r?.kind === "type") expect(r.type.id).toBe(room.roomTypeId);
  });

  it("redirects an old visible room code (any case) to its type page", async () => {
    const room = await makeRoom();
    const expected = { kind: "redirect", to: `/kamar/${room.roomType.slug}` };
    expect(await resolveKamarPath(room.code)).toEqual(expected);
    expect(await resolveKamarPath(room.code.toLowerCase())).toEqual(expected);
  });

  it("sends a type slug in another case to the canonical lowercase URL", async () => {
    const room = await makeRoom();
    const slug = room.roomType.slug;
    expect(await resolveKamarPath(slug.toUpperCase())).toEqual({ kind: "redirect", to: `/kamar/${slug}` });
    expect(await resolveKamarPath(slug.toUpperCase(), "?masuk=2027-01-15")).toEqual({ kind: "redirect", to: `/kamar/${slug}?masuk=2027-01-15` });
  });

  it("keeps the query string when redirecting an old room code", async () => {
    const room = await makeRoom();
    const q = queryString({ masuk: "2027-01-15", lama: "tahunan", none: undefined });
    expect(q).toBe("?masuk=2027-01-15&lama=tahunan");
    expect(await resolveKamarPath(room.code, q)).toEqual({ kind: "redirect", to: `/kamar/${room.roomType.slug}?masuk=2027-01-15&lama=tahunan` });
    expect(queryString({})).toBe("");
  });

  it("does not lead anywhere from a hidden room code or an unknown name", async () => {
    const room = await makeRoom({ hidden: true });
    expect(await resolveKamarPath(room.code)).toBeNull();
    expect(await resolveKamarPath("nope")).toBeNull();
  });
});

describe("booking bar params", () => {
  it("accepts real dates and known plans only", () => {
    expect(isoDateOrNull("2026-12-01")).toBe("2026-12-01");
    expect(isoDateOrNull("2026-02-30")).toBeNull();
    expect(isoDateOrNull("besok")).toBeNull();
    expect(planOrNull("tahunan")).toBe("tahunan");
    expect(planOrNull("12")).toBeNull();
  });
});
