import { ApplicationStatus, LeasePlan, RoomStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { sha256 } from "./crypto";
import { addMonths } from "./money";
import type { ContractData } from "./contract";

export const APPLICATION_TTL_MS = 48 * 3_600_000;

/** Looks up an application by the raw token from the URL. Never stores the raw value. */
export async function findApplicationByToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) return null;
  const app = await prisma.application.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { room: true, contact: true },
  });
  if (!app) return null;
  if (app.expiresAt < new Date()) return null;
  if (app.status === ApplicationStatus.EXPIRED || app.status === ApplicationStatus.CANCELLED) return null;
  return app;
}

/**
 * True when someone else's live application is already holding this room
 * (they submitted details, or signed and are paying). Prevents two people
 * signing and paying for the same room.
 */
export async function roomHeldByAnother(applicationId: string, roomId: string): Promise<boolean> {
  const other = await prisma.application.findFirst({
    where: {
      roomId,
      id: { not: applicationId },
      expiresAt: { gt: new Date() },
      status: { in: [ApplicationStatus.DETAILS_SUBMITTED, ApplicationStatus.SIGNED, ApplicationStatus.AWAITING_PAYMENT] },
    },
    select: { id: true },
  });
  return !!other;
}

export function termMonths(plan: LeasePlan, minMonths: number) {
  return plan === LeasePlan.YEARLY ? 12 : minMonths;
}

/** First payment = rent for the paid period + the deposit (depositMonths × monthly rent). */
export function onboardingAmount(monthlyPrice: number, plan: LeasePlan, yearlyMonths: number, depositMonths: number) {
  const rentMonths = plan === LeasePlan.YEARLY ? yearlyMonths : 1;
  return monthlyPrice * rentMonths + monthlyPrice * depositMonths;
}

export function termLabel(plan: LeasePlan, minMonths: number) {
  return plan === LeasePlan.YEARLY ? "12 bulan" : `${minMonths} bulan (minimum)`;
}

/** Everything the contract needs, assembled from the database. */
export async function buildContractData(applicationId: string, idNumber: string): Promise<ContractData> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { room: true },
  });
  const s = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });

  const start = app.moveInDate ?? new Date();
  const months = termMonths(app.plan, s.minMonths);

  return {
    propertyName: s.name,
    propertyAddress: s.address,
    reference: app.reference,
    tenantName: app.fullName ?? "",
    tenantPhone: app.phoneE164 ?? "",
    tenantIdNumber: idNumber,
    roomCode: app.room.code,
    roomType: app.room.type,
    roomSize: app.room.sizeLabel,
    plan: app.plan,
    monthlyRent: app.room.monthlyPrice,
    deposit: app.room.monthlyPrice * s.depositMonths,
    startDate: start,
    endDate: addMonths(start, months),
    termLabel: termLabel(app.plan, s.minMonths),
    lateFeePerDay: s.lateFeePerDay,
    lateFeeMax: s.lateFeeMax,
    dueDay: s.dueDayOfMonth,
    electricQuota: s.electricQuota,
    electricRate: s.electricRate,
    guestFee: s.guestFeePerNight,
    houseRules: s.houseRules,
    yearlyMonths: s.yearlyMonths,
    depositReturnDays: s.depositReturnDays,
    utilitiesNote: s.utilitiesNote,
    maxGuestNights: s.maxGuestNights,
  };
}

/** Marks stale applications dead and frees any room they were holding. */
export async function expireStaleApplications() {
  const stale = await prisma.application.findMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: [ApplicationStatus.DRAFT, ApplicationStatus.DETAILS_SUBMITTED, ApplicationStatus.SIGNED, ApplicationStatus.AWAITING_PAYMENT] },
    },
    select: { id: true, roomId: true },
  });
  if (!stale.length) return 0;

  await prisma.$transaction([
    prisma.application.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { status: ApplicationStatus.EXPIRED },
    }),
    prisma.room.updateMany({
      where: { id: { in: stale.map((a) => a.roomId) }, status: RoomStatus.BOOKED },
      data: { status: RoomStatus.AVAILABLE },
    }),
  ]);
  return stale.length;
}
