import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getRoomType } from "@/lib/room-types";
import { POST as roomTypes } from "@/app/api/admin/data/room-types/route";
import { POST as rooms } from "@/app/api/admin/data/rooms/route";
import { makeRoom, uniq } from "../helpers";

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), isOwner: async () => true }));

afterAll(() => prisma.$disconnect());

function post(path: string, values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return new NextRequest(`http://localhost:3000${path}`, { method: "POST", body: f, headers: { origin: "http://localhost:3000" } });
}

const typeForm = (slug: string, over: Record<string, string> = {}) => ({
  op: "save",
  name: `Tipe Uji ${slug}`,
  slug,
  sizeLabel: "3 × 3 m",
  monthlyPrice: "1500000",
  bathroom: "Kamar mandi luar",
  extras: "AC",
  description: "",
  sortOrder: "0",
  ...over,
});

describe("admin room types", () => {
  it("creates a type, updates its price, and the site reads the new price", async () => {
    const slug = `uji-${uniq()}`;
    const created = await roomTypes(post("/api/admin/data/room-types", typeForm(slug, { isVip: "on" })));
    expect(decodeURIComponent(created.headers.get("location") ?? "")).not.toContain("error");
    const type = await prisma.roomType.findUniqueOrThrow({ where: { slug } });
    expect(type).toMatchObject({ monthlyPrice: 1_500_000, isVip: true, isNew: false });

    const room = await makeRoom({ type: { id: type.id } });
    await roomTypes(post("/api/admin/data/room-types", { ...typeForm(slug, { monthlyPrice: "1750000" }), id: type.id }));
    expect((await getRoomType(slug))?.monthlyPrice).toBe(1_750_000);
    expect(room.roomTypeId).toBe(type.id);
  });

  it("refuses a duplicate slug", async () => {
    const slug = `uji-${uniq()}`;
    await roomTypes(post("/api/admin/data/room-types", typeForm(slug)));
    const again = await roomTypes(post("/api/admin/data/room-types", typeForm(slug)));
    expect(again.headers.get("location")).toContain("error=");
    expect(await prisma.roomType.count({ where: { slug } })).toBe(1);
  });

  it("refuses to delete a type that still has rooms", async () => {
    const room = await makeRoom();
    const res = await roomTypes(post("/api/admin/data/room-types", { op: "delete", id: room.roomTypeId }));
    expect(res.headers.get("location")).toContain("error=");
    expect(await prisma.roomType.count({ where: { id: room.roomTypeId } })).toBe(1);
  });

  it("assigns a room to a type without touching the type", async () => {
    const a = await makeRoom();
    const b = await makeRoom();
    await rooms(post("/api/admin/data/rooms", {
      op: "update", id: a.id, code: a.code, roomTypeId: b.roomTypeId, floor: "1", status: "AVAILABLE", availableOn: "", sortOrder: "0",
      monthlyPrice: "9999999",
    }));
    expect((await prisma.room.findUniqueOrThrow({ where: { id: a.id } })).roomTypeId).toBe(b.roomTypeId);
    expect((await prisma.roomType.findUniqueOrThrow({ where: { id: b.roomTypeId } })).monthlyPrice).toBe(1_000_000);
  });
});
