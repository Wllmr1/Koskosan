import { LeaseStatus, RoomStatus } from "@prisma/client";
import { prisma } from "./prisma";

/** Account codes the demo seed gives its fake renters ("DEMO-0001", …). Real renters never get this prefix. */
export const DEMO_ACCOUNT_PREFIX = "DEMO-";

export type DemoClearResult = {
  tenants: string[];
  leases: number;
  invoices: number;
  payments: number;
  meterRows: number;
  guestStays: number;
  tickets: number;
  contacts: number;
  roomsFreed: string[];
};

/**
 * Removes the demo seed's fake renters (account code DEMO-…) and everything
 * hanging off them: leases, their invoices and payments, meter readings taken
 * on the room during the demo lease, guest stays, complaints and website chats.
 * Each room they occupied becomes AVAILABLE with no "free from" date — unless
 * a real renter still holds an active lease on it. Never touches anyone else;
 * running it again removes nothing.
 */
export async function clearDemoData(): Promise<DemoClearResult> {
  const tenants = await prisma.tenant.findMany({
    where: { accountCode: { startsWith: DEMO_ACCOUNT_PREFIX } },
    select: { id: true, accountCode: true },
  });
  const tenantIds = tenants.map((t) => t.id);
  const leases = await prisma.lease.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true, roomId: true, startDate: true, endDate: true },
  });
  const leaseIds = leases.map((l) => l.id);
  const roomIds = [...new Set(leases.map((l) => l.roomId))];

  return prisma.$transaction(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { OR: [{ leaseId: { in: leaseIds } }, { guestStay: { tenantId: { in: tenantIds } } }] },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);
    const payments = await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.application.updateMany({ where: { leaseId: { in: leaseIds } }, data: { leaseId: null } });
    const invoiceCount = await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });

    let meterRows = 0;
    for (const l of leases) {
      const r = await tx.utilityPeriod.deleteMany({
        where: {
          roomId: l.roomId,
          period: { gte: new Date(Date.UTC(l.startDate.getUTCFullYear(), l.startDate.getUTCMonth(), 1)), lte: l.endDate },
          usedKwh: { gt: 0 }, // the seed's empty starter rows stay
        },
      });
      meterRows += r.count;
    }

    const guestStays = await tx.guestStay.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const tickets = await tx.ticket.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const contacts = await tx.contact.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const leaseCount = await tx.lease.deleteMany({ where: { id: { in: leaseIds } } });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });

    // Free the room only if nobody real still has it.
    const free = await tx.room.findMany({
      where: { id: { in: roomIds }, status: RoomStatus.OCCUPIED, leases: { none: { status: LeaseStatus.ACTIVE } } },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    });
    await tx.room.updateMany({ where: { id: { in: free.map((r) => r.id) } }, data: { status: RoomStatus.AVAILABLE, availableOn: null } });

    return {
      tenants: tenants.map((t) => t.accountCode).sort(),
      leases: leaseCount.count,
      invoices: invoiceCount.count,
      payments: payments.count,
      meterRows,
      guestStays: guestStays.count,
      tickets: tickets.count,
      contacts: contacts.count,
      roomsFreed: free.map((r) => r.code),
    };
  });
}
