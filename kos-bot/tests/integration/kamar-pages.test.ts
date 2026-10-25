import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { isoDateOrNull, planOrNull, resolveKamarPath } from "@/lib/room-types";
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
