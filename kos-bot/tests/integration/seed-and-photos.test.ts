import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importPhotos } from "../../prisma/import-photos";
import { prisma } from "@/lib/prisma";
import { availabilityOf } from "@/lib/room-types";

const NAMES = ["Standar", "Standard New", "Deluxe", "New Deluxe", "VIP 1", "VIP 2", "VIP A"];
const SLUGS = ["standar", "standard-new", "deluxe", "new-deluxe", "vip-1", "vip-2", "vip-a"];

async function jpeg(color: string) {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).jpeg().toBuffer();
}

describe("demo seed", () => {
  it("has the seven room types, each with at least two rooms", async () => {
    const types = await prisma.roomType.findMany({ where: { slug: { in: SLUGS } }, include: { rooms: true } });
    expect(types.map((t) => t.name).sort()).toEqual([...NAMES].sort());
    for (const t of types) expect(t.rooms.length).toBeGreaterThanOrEqual(2);
  });

  it("has a full type that shows when it frees up", async () => {
    const types = await prisma.roomType.findMany({ where: { slug: { in: SLUGS } }, include: { rooms: true } });
    const full = types.map((t) => availabilityOf(t.rooms)).filter((a) => a.free === 0 && a.nextFree !== null);
    expect(full.length).toBeGreaterThanOrEqual(1);
  });

  it("gives every occupied demo room an active lease for a demo renter", async () => {
    const rooms = await prisma.room.findMany({
      where: { status: "OCCUPIED", hidden: false, roomType: { slug: { in: SLUGS } } },
      include: { leases: { where: { status: "ACTIVE" }, include: { tenant: true } } },
    });
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) {
      expect(r.leases).toHaveLength(1);
      expect(r.leases[0].tenant.fullName.startsWith("Penghuni Demo")).toBe(true);
    }
  });

  it("removed the old sample rooms or hid them", async () => {
    const old = await prisma.room.findMany({ where: { code: { in: ["A-101", "B-201", "C-302"] } } });
    for (const r of old) expect(r.hidden).toBe(true);
  });
});

describe("importPhotos", () => {
  let dir: string;
  beforeAll(async () => {
    await prisma.photo.deleteMany({ where: { roomType: { slug: { in: ["vip-a", "standard-new"] } } } });
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "kos-photos-"));
    await fs.writeFile(path.join(dir, "vip-a-1.jpg"), await jpeg("#c08040"));
    await fs.writeFile(path.join(dir, "standard-new-2.jpg"), await jpeg("#4080c0"));
    await fs.writeFile(path.join(dir, "notes.txt"), "not a photo");
  });
  afterAll(() => fs.rm(dir, { recursive: true, force: true }));

  it("imports photos by filename prefix, skips other files, and does not repeat", async () => {
    const first = await importPhotos(dir);
    expect(first.imported).toBe(2);
    expect(first.skipped).toContain("notes.txt");
    const vipA = await prisma.roomType.findUniqueOrThrow({ where: { slug: "vip-a" }, include: { photos: true } });
    expect(vipA.photos).toHaveLength(1);
    expect(vipA.photos[0].isCover).toBe(true);
    const second = await importPhotos(dir);
    expect(second.imported).toBe(0);
  });

  it("returns nothing for a missing folder", async () => {
    await expect(importPhotos("/no/such/folder")).resolves.toEqual({ imported: 0, skipped: [] });
  });
});
