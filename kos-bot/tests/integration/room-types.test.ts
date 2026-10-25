import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getRoomType, listRoomTypes } from "@/lib/room-types";
import { makeRoom } from "../helpers";

afterAll(() => prisma.$disconnect());

describe("room types", () => {
  it("counts only visible free rooms in a type's availability", async () => {
    const first = await makeRoom();
    await makeRoom({ hidden: true, type: { id: first.roomTypeId } });
    const card = await getRoomType(first.roomType.slug);
    expect(card?.availability.free).toBe(1);
    expect((await listRoomTypes()).map((t) => t.id)).toContain(first.roomTypeId);
  });

  it("hides a type whose only room is hidden", async () => {
    const room = await makeRoom({ hidden: true });
    expect(await getRoomType(room.roomType.slug)).toBeNull();
    expect((await listRoomTypes()).map((t) => t.id)).not.toContain(room.roomTypeId);
  });

  it("returns null for an unknown slug", async () => {
    expect(await getRoomType("tidak-ada-tipe")).toBeNull();
  });
});
