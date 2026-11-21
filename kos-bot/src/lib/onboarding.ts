import { ApplicationStatus, LeaseStatus, RoomStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { putObject } from "./storage";
import { niceDate } from "./money";
import { deliverToRenter } from "./chat/deliver";

export class OnboardingError extends Error {}

/**
 * The paper contract was signed: the pending lease becomes active and the room
 * is officially the renter's. Optionally stores a scan of the signed contract
 * (PDF), which the renter can then download from their account page.
 */
export async function recordSignedContract(leaseId: string, scan: { buffer: Buffer } | null, actor: string) {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId }, include: { room: true, tenant: true } });
  if (!lease) throw new OnboardingError("Kontrak tidak ditemukan.");
  if (lease.status !== LeaseStatus.PENDING) throw new OnboardingError("Kontrak ini sudah dicatat.");

  let contractKey: string | null = null;
  if (scan && scan.buffer.length > 0) {
    if (scan.buffer.subarray(0, 5).toString() !== "%PDF-") throw new OnboardingError("File kontrak harus PDF.");
    if (scan.buffer.length > 10 * 1024 * 1024) throw new OnboardingError("File kontrak maksimal 10 MB.");
    contractKey = `contracts/${lease.tenant.accountCode}-${lease.room.code}-${Date.now()}.pdf`;
    await putObject(contractKey, scan.buffer, "application/pdf");
  }

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const period = new Date(Date.UTC(lease.startDate.getUTCFullYear(), lease.startDate.getUTCMonth(), 1));
  await prisma.$transaction([
    prisma.lease.update({
      where: { id: lease.id },
      data: { status: LeaseStatus.ACTIVE, signedAt: new Date(), ...(contractKey ? { contractKey } : {}) },
    }),
    prisma.room.update({ where: { id: lease.roomId }, data: { status: RoomStatus.OCCUPIED, availableOn: null } }),
    prisma.application.updateMany({ where: { leaseId: lease.id }, data: { status: ApplicationStatus.COMPLETED } }),
    // First month's electricity period, so the quota tool has something to read.
    prisma.utilityPeriod.upsert({
      where: { roomId_period: { roomId: lease.roomId, period } },
      create: { roomId: lease.roomId, period, quotaKwh: settings.electricQuota, ratePerKwh: settings.electricRate },
      update: {},
    }),
    prisma.auditLog.create({ data: { actor, action: "lease:signed", tenantId: lease.tenantId, meta: { room: lease.room.code } as never } }),
  ]);

  await deliverToRenter(
    lease.tenantId,
    `Kontrak kamar *${lease.room.code}* sudah tercatat ✅ Kamar resmi jadi milik kak ${lease.tenant.fullName.split(" ")[0]} mulai ${niceDate(lease.startDate)}. Selamat datang di ${settings.name}!`
  );
}
