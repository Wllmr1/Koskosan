import { InvoiceKind, InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { createInvoice } from "./xendit";
import { env } from "@/env";
import { fakePaymentsAllowed, paymentsLive } from "./features";

/** Human-readable invoice codes: INV-RENT-2610-0042 */
export async function nextInvoiceCode(prefix: string): Promise<string> {
  const stamp = new Date().toISOString().slice(2, 7).replace("-", "");
  const n = await prisma.invoice.count();
  return `INV-${prefix}-${stamp}-${String(n + 1).padStart(4, "0")}`;
}

/**
 * Makes sure an invoice has a live Xendit payment page, and returns its URL.
 * Idempotent: an invoice that already has a gateway URL is reused.
 */
export async function ensurePaymentUrl(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  if (invoice.status === InvoiceStatus.PAID) throw new Error("Invoice is already paid.");
  if (invoice.gatewayUrl && invoice.expiresAt && invoice.expiresAt > new Date()) return invoice.gatewayUrl;

  const remaining = invoice.amount - invoice.amountPaid;
  if (remaining <= 0) throw new Error("Nothing left to pay on this invoice.");

  // Development without Xendit: the built-in test page, never in production.
  if (!paymentsLive()) {
    if (!fakePaymentsAllowed()) throw new Error("Payments are not configured.");
    return `${env().APP_URL}/dev/pay/${invoice.code}`;
  }

  const gateway = await createInvoice({
    externalId: invoice.code,
    amount: remaining,
    description: invoice.description,
    durationSeconds: 86_400,
    successRedirect: `${env().APP_URL}/paid/${invoice.code}`,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      gatewayInvoiceId: gateway.id,
      gatewayUrl: gateway.invoice_url,
      expiresAt: new Date(gateway.expiry_date ?? Date.now() + 86_400_000),
    },
  });
  return updated.gatewayUrl!;
}

/** Creates an invoice row. The amount always originates in our own database. */
export async function createLocalInvoice(data: {
  kind: InvoiceKind;
  description: string;
  amount: number;
  dueDate: Date;
  leaseId?: string;
  applicationId?: string;
  guestStayId?: string;
  period?: Date;
}) {
  if (!Number.isInteger(data.amount) || data.amount <= 0) throw new Error("Invalid invoice amount.");
  const prefix =
    data.kind === InvoiceKind.GUEST
      ? "GUEST"
      : data.kind === InvoiceKind.ONBOARDING
        ? "NEW"
        : data.kind === InvoiceKind.UTILITY_OVERAGE
          ? "LISTRIK"
          : "RENT";
  return prisma.invoice.create({
    data: {
      code: await nextInvoiceCode(prefix),
      kind: data.kind,
      description: data.description,
      amount: data.amount,
      dueDate: data.dueDate,
      leaseId: data.leaseId,
      applicationId: data.applicationId,
      guestStayId: data.guestStayId,
      period: data.period,
    },
  });
}

/** Late fee owed on an overdue invoice, capped by the property settings. */
export function lateFeeFor(dueDate: Date, perDay: number, max: number, now = new Date()): number {
  const days = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return 0;
  return Math.min(days * perDay, max);
}

export type InvoiceWithLease = Prisma.InvoiceGetPayload<{ include: { lease: true } }>;
