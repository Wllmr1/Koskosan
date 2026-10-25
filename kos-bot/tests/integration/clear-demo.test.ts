import { execSync } from "node:child_process";
import { InvoiceKind, LeaseStatus, RoomStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { clearDemoData } from "@/lib/demo";
import { makeRoom, uniq } from "../helpers";

/**
 * Uses the demo occupancy the global setup's seed created, then puts it back
 * (rooms re-occupied, seed re-run) so other test files still see it.
 */
let demoRooms: { id: string; code: string; status: RoomStatus; availableOn: Date | null }[] = [];
let realTenant = "";
let realLease = "";
let realRoom = "";
let realInvoice = "";

beforeAll(async () => {
  const leases = await prisma.lease.findMany({
    where: { tenant: { accountCode: { startsWith: "DEMO-" } }, status: LeaseStatus.ACTIVE },
    include: { room: true },
  });
  demoRooms = leases.map((l) => ({ id: l.room.id, code: l.room.code, status: l.room.status, availableOn: l.room.availableOn }));

  // A real renter whose account code merely contains "DEMO", on a room of their own.
  const id = uniq();
  const room = await makeRoom({ status: RoomStatus.OCCUPIED });
  const tenant = await prisma.tenant.create({
    data: { accountCode: `WA-DEMO-${id}`, fullName: "Penghuni Asli", phoneE164: `+62823${id}`, dateOfBirth: new Date("2003-01-01"), idNumberEnc: encrypt(`3209200${id}`), idLast4: id.slice(-4) },
  });
  const lease = await prisma.lease.create({
    data: { tenantId: tenant.id, roomId: room.id, plan: "MONTHLY", monthlyRent: 1_000_000, deposit: 1_000_000, startDate: new Date("2026-06-01"), endDate: new Date("2027-06-01"), status: LeaseStatus.ACTIVE },
  });
  const invoice = await prisma.invoice.create({
    data: { code: `INV-R-${id}`, leaseId: lease.id, kind: InvoiceKind.RENT, description: "Sewa", amount: 1_000_000, dueDate: new Date("2026-11-05") },
  });
  [realTenant, realLease, realRoom, realInvoice] = [tenant.id, lease.id, room.id, invoice.id];
});

afterAll(async () => {
  for (const r of demoRooms) {
    await prisma.room.update({ where: { id: r.id }, data: { status: r.status, availableOn: r.availableOn } });
  }
  execSync("npx tsx prisma/seed.ts", { env: process.env, stdio: "ignore" });
  await prisma.$disconnect();
});

describe("clearing the demo renters", () => {
  it("removes the seed's demo occupancy and frees its rooms, leaving real renters alone", async () => {
    expect(demoRooms.length).toBeGreaterThan(0);
    const out = await clearDemoData();
    expect(out.tenants.length).toBeGreaterThan(0);
    expect(out.tenants.every((c) => c.startsWith("DEMO-"))).toBe(true);
    expect(out.roomsFreed.sort()).toEqual(demoRooms.map((r) => r.code).sort());

    expect(await prisma.tenant.count({ where: { accountCode: { startsWith: "DEMO-" } } })).toBe(0);
    for (const r of await prisma.room.findMany({ where: { id: { in: demoRooms.map((d) => d.id) } } })) {
      expect(r).toMatchObject({ status: RoomStatus.AVAILABLE, availableOn: null });
    }

    expect(await prisma.tenant.findUnique({ where: { id: realTenant } })).not.toBeNull();
    expect((await prisma.lease.findUniqueOrThrow({ where: { id: realLease } })).status).toBe(LeaseStatus.ACTIVE);
    expect(await prisma.invoice.findUnique({ where: { id: realInvoice } })).not.toBeNull();
    expect((await prisma.room.findUniqueOrThrow({ where: { id: realRoom } })).status).toBe(RoomStatus.OCCUPIED);
  });

  it("a second run removes nothing", async () => {
    expect(await clearDemoData()).toEqual({
      tenants: [], leases: 0, invoices: 0, payments: 0, meterRows: 0, guestStays: 0, tickets: 0, contacts: 0, roomsFreed: [],
    });
  });
});
