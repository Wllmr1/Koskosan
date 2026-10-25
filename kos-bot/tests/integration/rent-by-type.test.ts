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

describe("createApplicationForType", () => {
  it("hands out the first open room, then the next once details are submitted, then runs out", async () => {
    const { slug, rooms } = await typeWith([{}, {}]);
    const moveIn = date(tomorrow());

    const a = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn });
    expect(a.room.id).toBe(rooms[0].id);

    await prisma.application.update({
      where: { tokenHash: sha256(a.token) },
      data: { status: ApplicationStatus.DETAILS_SUBMITTED },
    });
    const b = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn });
    expect(b.room.id).toBe(rooms[1].id);

    await prisma.application.update({
      where: { tokenHash: sha256(b.token) },
      data: { status: ApplicationStatus.DETAILS_SUBMITTED },
    });
    await expect(createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn })).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("the last free room goes to whoever submits details first; the other is then turned away", async () => {
    const { slug, rooms } = await typeWith([{}]);
    const moveIn = date(tomorrow());
    const first = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn });
    const second = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn });
    expect(first.room.id).toBe(rooms[0].id);
    expect(second.room.id).toBe(rooms[0].id);

    const [f, s] = await Promise.all([
      prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(first.token) } }),
      prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(second.token) } }),
    ]);
    await prisma.application.update({ where: { id: f.id }, data: { status: ApplicationStatus.DETAILS_SUBMITTED } });
    expect(await roomOpenOn(s.id, rooms[0].id, moveIn)).toBe(false);
    expect(await roomOpenOn(f.id, rooms[0].id, moveIn)).toBe(true);
  });

  it("books ahead on an occupied room from the date it frees up", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    await expect(
      createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn: date("2027-01-10") })
    ).rejects.toMatchObject({ code: "unavailable" });

    const out = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "YEARLY", moveIn: date("2027-01-15") });
    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(out.token) } });
    expect(app.moveInDate?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("does not offer a room someone else is in the middle of booking", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.BOOKED }]);
    await expect(
      createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn: date(tomorrow()) })
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects an unknown type", async () => {
    await expect(
      createApplicationForType({ contactId: null, typeSlug: `nope-${uniq()}`, plan: "MONTHLY", moveIn: date(tomorrow()) })
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
    const res = await post(`type=${slug}&moveIn=2027-01-15&plan=bulanan`);
    expect(res.status).toBe(303);
    const path = new URL(res.headers.get("location")!).pathname;
    expect(path).toMatch(/^\/apply\//);
    const app = await prisma.application.findUniqueOrThrow({ where: { tokenHash: sha256(path.split("/").pop()!) } });
    expect(app.moveInDate?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("sends the visitor back to the type page when everything is taken", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    const res = await post(`type=${slug}&moveIn=2027-01-10&plan=bulanan`);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(
      `/kamar/${slug}?sewa=penuh`
    );
  });
});

describe("POST /api/apply (details) move-in date", () => {
  it("refuses a date before an occupied room frees up", async () => {
    const { slug } = await typeWith([{ status: RoomStatus.OCCUPIED, availableOn: date("2027-01-15") }]);
    const out = await createApplicationForType({ contactId: null, typeSlug: slug, plan: "MONTHLY", moveIn: date("2027-01-15") });

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
