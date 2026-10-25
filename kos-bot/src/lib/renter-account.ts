import { InvoiceKind, InvoiceStatus, LeaseStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { lateFeeFor } from "./billing";
import { firstOfMonth } from "./money";

const DAY_MS = 86_400_000;
/** Late fees apply to recurring charges, not to one-off guest or first payments. */
const LATE_FEE_KINDS: InvoiceKind[] = [InvoiceKind.RENT, InvoiceKind.UTILITY_OVERAGE, InvoiceKind.SERVICE];

export type RenterAccount = Awaited<ReturnType<typeof loadRenterAccount>>;

/**
 * Everything the renter's account page shows, for one tenant only. Every query
 * is scoped by tenantId from the server-side session — never from the URL.
 */
export async function loadRenterAccount(tenantId: string, now = new Date()) {
  const [tenant, settings] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { leases: { include: { room: { include: { roomType: true } } }, orderBy: { startDate: "desc" } } },
    }),
    prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } }),
  ]);

  // The lease in force now; failing that, one booked in advance (earliest first).
  const activeLeases = tenant.leases.filter((l) => l.status === LeaseStatus.ACTIVE);
  const current = activeLeases.find((l) => l.startDate <= now);
  const upcoming = activeLeases.filter((l) => l.startDate > now).at(-1);
  const active = current ?? upcoming;
  const shown = active ?? tenant.leases[0] ?? null;
  // Someone who has not moved in yet sees none of the room's meter data — it is the current renter's.
  const mine = { OR: [{ lease: { tenantId } }, { guestStay: { tenantId } }] };

  const [openInvoices, payments, guests, tickets, reading, overageBill] = await Promise.all([
    prisma.invoice.findMany({
      where: { ...mine, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { invoice: mine },
      include: { invoice: { select: { code: true, description: true } } },
      orderBy: { paidAt: "desc" },
      take: 12,
    }),
    prisma.guestStay.findMany({
      where: { tenantId, checkIn: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      include: { invoice: { select: { status: true } } },
      orderBy: { checkIn: "desc" },
      take: 10,
    }),
    prisma.ticket.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    current
      ? prisma.utilityPeriod.findUnique({ where: { roomId_period: { roomId: current.roomId, period: firstOfMonth(now) } } })
      : null,
    current
      ? prisma.invoice.findFirst({
          where: { leaseId: current.id, kind: InvoiceKind.UTILITY_OVERAGE, period: firstOfMonth(now) },
          select: { code: true },
        })
      : null,
  ]);

  const bills = openInvoices.map((inv) => {
    const remaining = inv.amount - inv.amountPaid;
    const overdue = inv.dueDate < now;
    const lateFee = overdue && LATE_FEE_KINDS.includes(inv.kind) ? lateFeeFor(inv.dueDate, settings.lateFeePerDay, settings.lateFeeMax, now) : 0;
    return { code: inv.code, kind: inv.kind, description: inv.description, remaining, dueDate: inv.dueDate, overdue, lateFee };
  });

  const electricity = reading
    ? (() => {
        const usedKwh = Number(reading.usedKwh);
        const overKwh = Math.max(0, Math.round((usedKwh - reading.quotaKwh) * 100) / 100);
        return {
          usedKwh,
          quotaKwh: reading.quotaKwh,
          remainingKwh: Math.max(0, Math.round((reading.quotaKwh - usedKwh) * 100) / 100),
          overKwh,
          rate: reading.ratePerKwh,
          extraCharge: Math.round(overKwh * reading.ratePerKwh),
          updatedAt: reading.updatedAt,
          billed: Boolean(overageBill),
        };
      })()
    : null;

  return {
    name: tenant.fullName,
    accountCode: tenant.accountCode,
    lease: shown && {
      status: shown.status,
      roomCode: shown.room.code,
      roomType: shown.room.roomType.name,
      plan: shown.plan,
      monthlyRent: shown.monthlyRent,
      deposit: shown.deposit,
      startDate: shown.startDate,
      endDate: shown.endDate,
      notStarted: shown.status === LeaseStatus.ACTIVE && shown.startDate > now,
      daysLeft: Math.max(0, Math.ceil((shown.endDate.getTime() - now.getTime()) / DAY_MS)),
      noticeBy: new Date(shown.endDate.getTime() - 30 * DAY_MS),
      noticePassed: shown.endDate.getTime() - 30 * DAY_MS < now.getTime(),
      hasContract: Boolean(shown.contractKey),
    },
    bills,
    totalOwed: bills.reduce((sum, b) => sum + b.remaining, 0),
    totalLateFees: bills.reduce((sum, b) => sum + b.lateFee, 0),
    electricity,
    payments: payments.map((p) => ({ paidAt: p.paidAt, amount: p.amount, description: p.invoice.description, code: p.invoice.code })),
    guests: guests.map((g) => ({
      code: g.code,
      name: g.guestName,
      idLast4: g.idLast4,
      checkIn: g.checkIn,
      nights: g.nights,
      fee: g.fee,
      approved: g.approved,
      unpaid: g.invoice?.status === InvoiceStatus.UNPAID || g.invoice?.status === InvoiceStatus.PARTIAL,
    })),
    tickets: tickets.map((t) => ({ code: t.code, category: t.category, description: t.description, status: t.status, createdAt: t.createdAt })),
    dueDay: settings.dueDayOfMonth,
  };
}
