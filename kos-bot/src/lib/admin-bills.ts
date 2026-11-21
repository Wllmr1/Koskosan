import { InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { billState, daysLate, KIND_LABEL, type BillState } from "./payment-proofs";

/** Status filter chips on the Tagihan page, in the owner's words. */
export const STATE_FILTERS = {
  verifikasi: { label: "Perlu verifikasi", states: ["pending"] },
  terlambat: { label: "Terlambat", states: ["late"] },
  belum: { label: "Belum dibayar", states: ["due", "rejected", "late"] },
  lunas: { label: "Lunas", states: ["paid"] },
} as const satisfies Record<string, { label: string; states: BillState[] }>;
export type StateFilter = keyof typeof STATE_FILTERS;

/** Type filter chips: the owner thinks in deposit / rent / electricity, the rest is "lainnya". */
export const KIND_FILTERS = {
  deposit: { label: "Deposit", kinds: [InvoiceKind.DEPOSIT] },
  sewa: { label: "Sewa", kinds: [InvoiceKind.RENT, InvoiceKind.ONBOARDING] },
  listrik: { label: "Listrik", kinds: [InvoiceKind.UTILITY_OVERAGE] },
  lainnya: { label: "Lainnya", kinds: [InvoiceKind.GUEST, InvoiceKind.LATE_FEE, InvoiceKind.SERVICE] },
} as const satisfies Record<string, { label: string; kinds: InvoiceKind[] }>;
export type KindFilter = keyof typeof KIND_FILTERS;

export type AdminBill = Awaited<ReturnType<typeof loadBills>>[number];

/**
 * Every bill the owner might act on, newest first, with who owes it and where
 * it stands. Paid bills only from the last 90 days, so the list stays short.
 */
export async function loadBills(now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await prisma.invoice.findMany({
    where: {
      status: { notIn: [InvoiceStatus.VOID] },
      OR: [{ status: { not: InvoiceStatus.PAID } }, { createdAt: { gte: since } }],
      // An application's deposit that expired unpaid is noise.
      NOT: { status: InvoiceStatus.EXPIRED, kind: InvoiceKind.DEPOSIT },
    },
    include: {
      proofs: { orderBy: { uploadedAt: "desc" } },
      lease: { include: { tenant: true, room: { include: { roomType: true } } } },
      application: { include: { room: { include: { roomType: true } } } },
      guestStay: { include: { tenant: true } },
      payments: { orderBy: { paidAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return rows.map((inv) => {
    const state = billState(inv, inv.proofs, now);
    const tenant = inv.lease?.tenant ?? inv.guestStay?.tenant ?? null;
    const prospect = !inv.lease && !!inv.application;
    return {
      id: inv.id,
      code: inv.code,
      kind: inv.kind,
      kindLabel: KIND_LABEL[inv.kind],
      description: inv.description,
      amount: inv.amount,
      remaining: inv.amount - inv.amountPaid,
      dueDate: inv.dueDate,
      state,
      daysLate: state === "late" ? daysLate(inv.dueDate, now) : 0,
      payer: tenant?.fullName ?? inv.application?.fullName ?? "-",
      where: inv.lease?.room.code ?? (inv.application ? inv.application.room.roomType.name : ""),
      prospect,
      reference: inv.application?.reference ?? null,
      pendingProof: inv.proofs.find((p) => p.status === "SUBMITTED") ?? null,
      paidAt: inv.payments[0]?.paidAt ?? null,
      lastReview: inv.proofs.find((p) => p.status !== "SUBMITTED") ?? null,
    };
  });
}

export function filterBills(bills: AdminBill[], state?: string, kind?: string) {
  const st = state && state in STATE_FILTERS ? (STATE_FILTERS[state as StateFilter].states as readonly BillState[]) : null;
  const kd = kind && kind in KIND_FILTERS ? (KIND_FILTERS[kind as KindFilter].kinds as readonly InvoiceKind[]) : null;
  return bills.filter((b) => (!st || st.includes(b.state)) && (!kd || kd.includes(b.kind)));
}
