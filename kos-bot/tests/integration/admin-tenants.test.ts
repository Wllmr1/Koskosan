import { LeaseStatus, RoomStatus } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { addExistingTenant, parseExistingTenant } from "@/lib/admin-tenants";
import { makeRoom, uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

async function freeRoom() {
  return makeRoom({ type: { monthlyPrice: 1_350_000 } });
}

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const base = (roomId: string, phone: string) => ({
  fullName: "Budi Lama Santoso",
  phone,
  dateOfBirth: "2003-05-05",
  idNumber: "3201 5555 6666 7777",
  roomId,
  plan: "MONTHLY",
  monthlyRent: "1300000",
  deposit: "1300000",
  startDate: "2026-03-01",
  endDate: "2027-02-28",
});

describe("adding a renter who signed on paper", () => {
  it("creates the renter, an active lease and marks the room occupied", async () => {
    const room = await freeRoom();
    const phone = `0812${uniq().slice(-8)}`;
    const parsed = parseExistingTenant(form(base(room.id, phone)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const { tenant, lease } = await addExistingTenant(parsed.data, null, "owner");
    expect(tenant.phoneE164).toBe(`+62${phone.slice(1)}`);
    expect(decrypt(tenant.idNumberEnc)).toBe("3201555566667777");
    expect(tenant.passwordHash).toBeNull();
    expect(lease).toMatchObject({ status: LeaseStatus.ACTIVE, monthlyRent: 1_300_000, deposit: 1_300_000 });
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(RoomStatus.OCCUPIED);
  });

  it("refuses a phone that already belongs to a renter, and a room that already has one", async () => {
    const room = await freeRoom();
    const phone = `0812${uniq().slice(-8)}`;
    const first = parseExistingTenant(form(base(room.id, phone)));
    if (!first.success) throw new Error("parse");
    await addExistingTenant(first.data, null, "owner");

    await expect(addExistingTenant(first.data, null, "owner")).rejects.toThrow(/nomor HP/i);

    const other = parseExistingTenant(form(base(room.id, `0812${uniq().slice(-8)}`)));
    if (!other.success) throw new Error("parse");
    await expect(addExistingTenant(other.data, null, "owner")).rejects.toThrow(/sudah ada penghuni aktif/);
  });

  it("rejects bad input before touching the database", () => {
    const ok = base("r", "081200000000");
    expect(parseExistingTenant(form({ ...ok, idNumber: "123" })).success).toBe(false);
    expect(parseExistingTenant(form({ ...ok, endDate: "2026-02-01" })).success).toBe(false); // ends before it starts
    expect(parseExistingTenant(form({ ...ok, fullName: "Budi" })).success).toBe(false); // full name needed
  });
});
