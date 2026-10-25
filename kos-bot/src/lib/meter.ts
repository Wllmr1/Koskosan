import { InvoiceKind, LeaseStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { createLocalInvoice } from "./billing";
import { rp } from "./money";
import { deliverToRenter } from "./chat/deliver";

const MAX_KWH = 5_000;

export const monthLabel = (period: Date) =>
  period.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

const DAY_MS = 86_400_000;

/** Days of [start, end) that a lease covers. */
const daysCovered = (lease: { startDate: Date; endDate: Date }, start: Date, end: Date) =>
  Math.max(0, Math.min(lease.endDate.getTime() + DAY_MS, end.getTime()) - Math.max(lease.startDate.getTime(), start.getTime()));

/**
 * Every room with a renter during the month, with its reading for the month
 * and whether it was billed. A room has one row: the active lease in force
 * that month (a renter booked in advance is not billed for the current
 * renter's electricity). If two leases share the month, the one covering more
 * of it wins; on a tie, the earlier one.
 */
export async function meterSheet(period: Date) {
  const periodEnd = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  const [leases, settings] = await Promise.all([
    prisma.lease.findMany({
      where: { status: LeaseStatus.ACTIVE, startDate: { lt: periodEnd }, endDate: { gte: period } },
      include: {
        room: { include: { utility: { where: { period } } } },
        tenant: { select: { id: true, fullName: true } },
      },
      orderBy: [{ room: { sortOrder: "asc" } }, { room: { code: "asc" } }, { startDate: "asc" }],
    }),
    prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } }),
  ]);

  const inForce = new Map<string, (typeof leases)[number]>();
  for (const lease of leases) {
    const held = inForce.get(lease.roomId);
    if (!held || daysCovered(lease, period, periodEnd) > daysCovered(held, period, periodEnd)) inForce.set(lease.roomId, lease);
  }
  const chosen = [...inForce.values()];

  // A room's month is billed once, whichever of its leases the bill went to.
  const billedRooms = new Set(
    (
      await prisma.invoice.findMany({
        where: { kind: InvoiceKind.UTILITY_OVERAGE, period, lease: { roomId: { in: chosen.map((l) => l.roomId) } } },
        select: { lease: { select: { roomId: true } } },
      })
    ).map((i) => i.lease?.roomId)
  );

  return chosen.map((lease) => {
    const reading = lease.room.utility[0];
    const usedKwh = reading ? Number(reading.usedKwh) : null;
    const quotaKwh = reading?.quotaKwh ?? settings.electricQuota;
    const rate = reading?.ratePerKwh ?? settings.electricRate;
    const overKwh = usedKwh === null ? 0 : Math.max(0, Math.round((usedKwh - quotaKwh) * 100) / 100);
    return {
      roomId: lease.roomId,
      roomCode: lease.room.code,
      leaseId: lease.id,
      tenantId: lease.tenant.id,
      tenantName: lease.tenant.fullName,
      usedKwh,
      quotaKwh,
      rate,
      overKwh,
      extraCharge: Math.round(overKwh * rate),
      billed: billedRooms.has(lease.roomId),
    };
  });
}

/** Saves kWh used per room for the month (a later save overwrites the earlier one). */
export async function saveMeterReadings(period: Date, entries: { roomId: string; usedKwh: number }[]) {
  for (const e of entries) {
    if (!Number.isFinite(e.usedKwh) || e.usedKwh < 0 || e.usedKwh > MAX_KWH) {
      throw new Error(`Angka meteran tidak masuk akal: ${e.usedKwh}`);
    }
  }
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  for (const e of entries) {
    const usedKwh = Math.round(e.usedKwh * 100) / 100;
    await prisma.utilityPeriod.upsert({
      where: { roomId_period: { roomId: e.roomId, period } },
      create: { roomId: e.roomId, period, usedKwh, quotaKwh: settings.electricQuota, ratePerKwh: settings.electricRate, source: "OWNER" },
      update: { usedKwh, source: "OWNER" },
    });
  }
}

/**
 * Creates one over-limit bill per room that used more than its quota in the
 * month — never twice for the same month — due on next month's due day, and
 * puts a message with a pay button into the renter's chat.
 */
export async function billOverage(period: Date) {
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const due = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, settings.dueDayOfMonth));
  const rows = (await meterSheet(period)).filter((r) => r.overKwh > 0 && !r.billed);

  for (const r of rows) {
    const invoice = await createLocalInvoice({
      kind: InvoiceKind.UTILITY_OVERAGE,
      description: `Kelebihan listrik ${monthLabel(period)} (${r.overKwh} kWh) — kamar ${r.roomCode}`,
      amount: r.extraCharge,
      dueDate: due,
      leaseId: r.leaseId,
      period,
    });
    await deliverToRenter(
      r.tenantId,
      `Tagihan kelebihan listrik ${monthLabel(period)}: ${r.overKwh} kWh di atas kuota ${r.quotaKwh} kWh, total *${rp(r.extraCharge)}*. Jatuh tempo ${due.toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })}.`,
      [{ kind: "link", label: "Bayar", path: `/p/${invoice.code}` }]
    );
  }
  if (rows.length) {
    await prisma.auditLog.create({ data: { actor: "owner", action: "meter:bill", meta: { period: period.toISOString().slice(0, 7), count: rows.length } as never } });
  }
  return { created: rows.length };
}
