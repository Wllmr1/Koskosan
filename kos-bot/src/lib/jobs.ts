import { ContactType, InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { log } from "./logger";
import { expireStaleApplications, scrubClosedApplications } from "./application";
import { createLocalInvoice, ensurePaymentUrl } from "./billing";
import { niceDate, rp } from "./money";
import { sendTemplateWithUrlButton, waIdFromE164 } from "./whatsapp";
import { deleteObject } from "./storage";
import { retryOwnerAlerts } from "./notify";
import { whatsappEnabled } from "./features";

/**
 * Hourly. Enforces the retention promise:
 *  - prospects vanish 24h after their last message (Contact + chat, cascaded)
 *  - renters keep 90 days of chat; their account data is never touched here
 */
export async function purgeChatMemory() {
  const now = new Date();

  const prospects = await prisma.contact.deleteMany({
    where: { type: ContactType.PROSPECT, expiresAt: { lt: now } },
  });

  const messages = await prisma.message.deleteMany({ where: { expiresAt: { lt: now } } });

  const dedupe = await prisma.processedWebhook.deleteMany({
    where: { receivedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
  });

  const counters = await prisma.rateCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await prisma.verifyToken.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  const applications = await expireStaleApplications();
  const applicationsScrubbed = await scrubClosedApplications();

  // Empty conversations left behind by message expiry
  const emptyConvos = await prisma.conversation.deleteMany({ where: { messages: { none: {} } } });

  // Owner alerts whose email or WhatsApp failed get another try every hour.
  const alertsRetried = await retryOwnerAlerts().catch((e) => {
    log.error("owner alert retry crashed", { message: String(e) });
    return 0;
  });

  const result = {
    alertsRetried,
    prospects: prospects.count,
    messages: messages.count,
    dedupe: dedupe.count,
    counters: counters.count,
    tokens: tokens.count,
    applicationsExpired: applications,
    applicationsScrubbed,
    conversations: emptyConvos.count,
  };

  await prisma.auditLog.create({ data: { actor: "job:purge", action: "purge", meta: result as never } });
  log.info("purge complete", result);
  return result;
}

/**
 * Daily. Deletes KTP photos and contracts belonging to leases that ended more
 * than 12 months ago — the retention period stated in the contract.
 */
export async function purgeExpiredDocuments() {
  const cutoff = new Date(Date.now() - 365 * 86_400_000);
  const tenants = await prisma.tenant.findMany({
    where: {
      ktpObjectKey: { not: null },
      leases: { every: { status: { in: ["ENDED", "CANCELLED"] }, endDate: { lt: cutoff } } },
    },
    select: { id: true, ktpObjectKey: true },
  });

  for (const tenant of tenants) {
    if (!tenant.ktpObjectKey) continue;
    await deleteObject(tenant.ktpObjectKey).catch(() => undefined);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { ktpObjectKey: null } });
  }
  if (tenants.length) log.info("expired KTP documents removed", { count: tenants.length });
  return tenants.length;
}

/**
 * Daily. Raises next month's rent invoice and nudges anyone who is late.
 * Runs outside the 24-hour window, so it uses approved templates.
 */
export async function runRentCycle() {
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const today = new Date();
  const created = await issueUpcomingRent(settings.dueDayOfMonth);
  const reminded = await remindUnpaid(settings.dueDayOfMonth, today);
  await prisma.auditLog.create({
    data: { actor: "job:rent", action: "rent-cycle", meta: { created, reminded } as never },
  });
  return { created, reminded };
}

/** Creates the next monthly invoice a week before it is due. */
async function issueUpcomingRent(dueDay: number): Promise<number> {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
  if (target < now) target.setUTCMonth(target.getUTCMonth() + 1);
  const daysAway = (target.getTime() - now.getTime()) / 86_400_000;
  if (daysAway > 7) return 0;

  const period = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE", plan: "MONTHLY", endDate: { gte: target } },
    include: { room: true, tenant: true },
  });

  let created = 0;
  for (const lease of leases) {
    const exists = await prisma.invoice.findFirst({
      where: { leaseId: lease.id, kind: InvoiceKind.RENT, period },
    });
    if (exists) continue;

    const invoice = await createLocalInvoice({
      kind: InvoiceKind.RENT,
      description: `Sewa kamar ${lease.room.code} — ${period.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      amount: lease.monthlyRent,
      dueDate: target,
      leaseId: lease.id,
      period,
    });

    if (whatsappEnabled()) {
      try {
        await ensurePaymentUrl(invoice.id); // warm the gateway page before we link to it
        await sendTemplateWithUrlButton(
          waIdFromE164(lease.tenant.phoneE164),
          "rent_due_reminder",
          "id",
          [lease.tenant.fullName.split(" ")[0], lease.room.code, rp(lease.monthlyRent), niceDate(target)],
          invoice.code
        );
      } catch (e) {
        log.warn("rent reminder failed", { invoice: invoice.code, message: String(e) });
      }
    }
    created++;
  }
  return created;
}

/** Nudges overdue invoices once every three days, never more. */
async function remindUnpaid(dueDay: number, today: Date): Promise<number> {
  if (!whatsappEnabled()) return 0;
  const overdue = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] },
      dueDate: { lt: today },
      lease: { status: "ACTIVE" },
    },
    include: { lease: { include: { tenant: true, room: true } } },
    take: 50,
  });

  let sent = 0;
  for (const invoice of overdue) {
    const daysLate = Math.floor((today.getTime() - invoice.dueDate.getTime()) / 86_400_000);
    if (daysLate % 3 !== 0) continue;
    const tenant = invoice.lease?.tenant;
    const room = invoice.lease?.room;
    if (!tenant || !room) continue;

    try {
      await ensurePaymentUrl(invoice.id);
      await sendTemplateWithUrlButton(
        waIdFromE164(tenant.phoneE164),
        "rent_overdue",
        "id",
        [tenant.fullName.split(" ")[0], room.code, rp(invoice.amount - invoice.amountPaid), String(daysLate)],
        invoice.code
      );
      sent++;
    } catch (e) {
      log.warn("overdue reminder failed", { invoice: invoice.code, message: String(e) });
    }
  }
  return sent;
}
