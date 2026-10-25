import { ApplicationStatus, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/crypto";
import { niceDate } from "@/lib/money";
import { createApplicationForType, roomOpenOn } from "@/lib/application";
import { POST as startOnline } from "@/app/api/apply/start/route";
import { POST as submitDetails } from "@/app/api/apply/route";
import { makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function typeWith(rooms: { status?: RoomStatus; availableOn?: Date }[]) {
  const first = await makeRoom({ ...rooms[0], type: {} });
  await prisma.room.update({ where: { id: first.id }, data: { sortOrder: 0 } });
  const made = [first];
  for (const [i, r] of rooms.slice(1).entries()) {
    const m = await makeRoom({ ...r, type: { id: first.roomTypeId } });
    await prisma.room.update({ where: { id: m.id }, data: { sortOrder: i + 1 } });
    made.push(m);
  }
  return { slug: first.roomType.slug, rooms: made };
}

async function details(token: string, moveInDate: string) {
  const form = new FormData();
  const fields: Record<string, string> = {
    token,
    fullName: "Budi Santoso",
    phone: "081234567890",
    dateOfBirth: "1999-01-01",
    idNumber: "3171234567890001",
    moveInDate,
    password: "kata-sandi-aman-9",
    passwordConfirm: "kata-sandi-aman-9",
  };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("ktp", new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "ktp.jpg", { type: "image/jpeg" }));
  return submitDetails(
    new NextRequest("http://localhost:3000/api/apply", { method: "POST", headers: { "x-real-ip": `10.9.${uniq()}` }, body: form })
  );
}

describe("createApplicationForType", () => {
  it("hands out the first open room, then the next once details are submitted, then runs out", async () => {
    const { slug, rooms } = await typeWith([{}, {}]);
    const moveIn = date(tomorrow());

    const a = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn });
    expect(a.room.id).toBe(rooms[0].id);

    await prisma.application.update({
      where: { tokenHash: sha256(a.token) },
      data: { status: ApplicationStatus.DETAILS_SUBMITTED },
    });
    const b = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn });
    expect(b.room.id).toBe(rooms[1].id);

    await prisma.application.update({
      where: { tokenHash: sha256(b.token) },
      data: { status: ApplicationStatus.DETAILS_SUBMITTED },
    });
    await expect(createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn })).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("two starts for the last free room: the first to submit keeps it, the second is moved to another room or told it is full", async () => {
    const { slug, rooms } = await typeWith([{}, {}]);
    const moveIn = date(tomorrow());
    const first = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn });
    const second = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn });
    expect(first.room.id).toBe(rooms[0].id);
    expect(second.room.id).toBe(rooms[0].id);

    expect((await details(first.token, tomorrow())).status).toBe(200);
    const res = await details(second.token, tomorrow());
    expect(res.status).toBe(200);
    const moved = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(second.token) } });
    expect(moved.roomId).toBe(rooms[1].id);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: rooms[1].id } })).status).toBe(RoomStatus.BOOKED);

    // A third person who started earlier now finds the type full.
    const { slug: slug2 } = await typeWith([{}]);
    const a = await createApplicationForType({ contactId: null, typeSlug: slug2, months: 12, moveIn });
    const b = await createApplicationForType({ contactId: null, typeSlug: slug2, months: 12, moveIn });
    expect((await details(a.token, tomorrow())).status).toBe(200);
    const typeName = (await prisma.roomType.findUniqueOrThrow({ where: { id: a.room.roomTypeId } })).name;
    const full = await details(b.token, tomorrow());
    expect(full.status).toBe(409);
    expect((await full.json()).error).toBe(`Maaf, kamar ${typeName} untuk tanggal itu sudah penuh. Lihat tanggal lain di /kamar/${slug2}.`);
  });

  it("books ahead on an occupied room from the date it frees up", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    await expect(
      createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn: date("2027-01-10") })
    ).rejects.toMatchObject({ code: "unavailable" });

    const out = await createApplicationForType({ contactId: null, typeSlug: slug, months: 24, moveIn: date("2027-01-15") });
    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(out.token) } });
    expect(app.moveInDate?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("for a later move-in, takes the room freeing up latest before that date and keeps free rooms free", async () => {
    const { slug, rooms } = await typeWith([
      {},
      { status: RoomStatus.OCCUPIED, availableOn: date("2027-01-10") },
      { status: RoomStatus.OCCUPIED, availableOn: date("2027-01-20") },
    ]);
    const start = async (moveIn: string) =>
      (await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn: date(moveIn) })).room.id;
    expect(await start("2027-01-15")).toBe(rooms[1].id);
    expect(await start("2027-01-25")).toBe(rooms[2].id);
    expect(await start("2027-01-05")).toBe(rooms[0].id);
  });

  it("for a move-in today, takes a room free now first", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { slug, rooms } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2026-01-01") }, {}]);
    const out = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn: date(today) });
    expect(out.room.id).toBe(rooms[1].id);
  });

  it("does not offer a room someone else is in the middle of booking", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.BOOKED }]);
    await expect(
      createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn: date(tomorrow()) })
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects an unknown type", async () => {
    await expect(
      createApplicationForType({ contactId: null, typeSlug: `nope-${uniq()}`, months: 12, moveIn: date(tomorrow()) })
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("POST /api/apply/start with a type", () => {
  const post = (body: string) =>
    startOnline(
      new NextRequest("http://localhost:3000/api/apply/start", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/x-www-form-urlencoded",
          "x-real-ip": `10.8.${uniq()}`,
        },
        body,
      })
    );

  it("redirects to the secure form with the chosen date saved", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    const res = await post(`type=${slug}&moveIn=2027-01-15&months=6`);
    expect(res.status).toBe(303);
    const path = new URL(res.headers.get("location")!).pathname;
    expect(path).toMatch(/^\/apply\//);
    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(path.split("/").pop()!) } });
    expect(app.moveInDate?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(app.plan).toBe("MONTHLY");
    expect(app.termMonths).toBe(6);
  });

  it("asks for a contract length first", async () => {
    const { slug } = await typeWith([{}]);
    const res = await post(`type=${slug}&moveIn=${tomorrow()}`);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(`/kamar/${slug}?sewa=lama`);
  });

  it("sends the visitor back to the type page when everything is taken", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    const res = await post(`type=${slug}&moveIn=2027-01-10&months=6`);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(
      `/kamar/${slug}?sewa=penuh`
    );
  });
});

describe("POST /api/apply (details) move-in date", () => {
  it("refuses a date before an occupied room frees up", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    const out = await createApplicationForType({ contactId: null, typeSlug: slug, months: 12, moveIn: date("2027-01-15") });

    const form = new FormData();
    const fields: Record<string, string> = {
      token: out.token,
      fullName: "Budi Santoso",
      phone: "081234567890",
      dateOfBirth: "1999-01-01",
      idNumber: "3171234567890001",
      moveInDate: "2027-01-10",
      password: "x".repeat(12),
      passwordConfirm: "x".repeat(12),
    };
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const res = await submitDetails(
      new NextRequest("http://localhost:3000/api/apply", { method: "POST", headers: { "x-real-ip": `10.9.${uniq()}` }, body: form })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Tanggal masuk paling cepat ${niceDate(date("2027-01-15"))}.`);
  });
});
