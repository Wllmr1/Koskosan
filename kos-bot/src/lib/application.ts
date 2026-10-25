import { ApplicationStatus, LeasePlan, RoomStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { newToken, sha256 } from "./crypto";
import { addMonths } from "./money";
import { deleteObject } from "./storage";
import type { ContractData } from "./contract";

export const APPLICATION_TTL_MS = 48 * 3_600_000;

export class ApplicationError extends Error {
  constructor(
    readonly code: "not_found" | "unavailable",
    message: string
  ) {
    super(message);
  }
}

/**
 * Starts the secure sign-up flow for one room. Used by the assistant's
 * start_application tool and by the "Sewa kamar ini" button, so both follow
 * the same rules: the room must exist, be visible and be available. Returns
 * the raw form token (only its hash is stored).
 */
export async function createApplication(opts: { contactId: string | null; roomCode: string; plan: LeasePlan }) {
  const code = opts.roomCode.trim().toUpperCase().slice(0, 20);
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || room.hidden) throw new ApplicationError("not_found", `No room called ${code}.`);
  if (room.status !== RoomStatus.AVAILABLE) {
    throw new ApplicationError("unavailable", `Room ${room.code} is ${room.status.toLowerCase()}.`);
  }

  const { raw, hash } = newToken();
  const count = await prisma.application.count();
  const reference = `APP-${String(1000 + count + 1)}`;
  await prisma.application.create({
    data: {
      reference,
      tokenHash: hash,
      contactId: opts.contactId,
      roomId: room.id,
      plan: opts.plan,
      expiresAt: new Date(Date.now() + APPLICATION_TTL_MS),
    },
  });
  return { reference, token: raw, room };
}

/**
 * Can this room be rented for a move-in on `moveIn` (a calendar date stored as
 * UTC midnight)? Visible, not held by someone else's live application, and
 * either free, occupied but freeing up by then, or (only when we pass our own
 * application) held by us. With no application of our own yet, a BOOKED room
 * is someone else's in-progress application and is not open.
 */
export async function roomOpenOn(applicationId: string | null, roomId: string, moveIn: Date): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { status: true, hidden: true, availableOn: true },
  });
  if (!room || room.hidden) return false;
  const statusOk =
    room.status === RoomStatus.AVAILABLE ||
    (room.status === RoomStatus.BOOKED && applicationId !== null) ||
    (room.status === RoomStatus.OCCUPIED && room.availableOn !== null && room.availableOn.getTime() <= moveIn.getTime());
  if (!statusOk) return false;
  return !(await roomHeldByAnother(applicationId, roomId));
}

/** First visible room of a type (by sortOrder, then code) that is open on the move-in date. */
export async function firstOpenRoomOfType(type: { slug: string } | { id: string }, moveIn: Date) {
  const candidates = await prisma.room.findMany({
    where: { hidden: false, roomType: type },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  for (const c of candidates) {
    if (await roomOpenOn(null, c.id, moveIn)) return c;
  }
  return null;
}

/**
 * Starts the sign-up flow for a room TYPE: the system picks the first room
 * (by sortOrder, then code) that is open on the move-in date.
 */
export async function createApplicationForType(opts: {
  contactId: string | null;
  typeSlug: string;
  plan: LeasePlan;
  moveIn: Date;
}) {
  const known = await prisma.room.count({ where: { hidden: false, roomType: { slug: opts.typeSlug } } });
  if (!known) throw new ApplicationError("not_found", `No room type called ${opts.typeSlug}.`);
  const room = await firstOpenRoomOfType({ slug: opts.typeSlug }, opts.moveIn);
  if (!room) throw new ApplicationError("unavailable", `No ${opts.typeSlug} room is open on that date.`);

  const { raw, hash } = newToken();
  const count = await prisma.application.count();
  const reference = `APP-${String(1000 + count + 1)}`;
  await prisma.application.create({
    data: {
      reference,
      tokenHash: hash,
      contactId: opts.contactId,
      roomId: room.id,
      plan: opts.plan,
      moveInDate: opts.moveIn,
      expiresAt: new Date(Date.now() + APPLICATION_TTL_MS),
    },
  });
  return { reference, token: raw, room };
}

/** Looks up an application by the raw token from the URL. Never stores the raw value. */
export async function findApplicationByToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) return null;
  const app = await prisma.application.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { room: { include: { roomType: true } }, contact: true },
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
export async function roomHeldByAnother(applicationId: string | null, roomId: string): Promise<boolean> {
  const other = await prisma.application.findFirst({
    where: {
      roomId,
      ...(applicationId ? { id: { not: applicationId } } : {}),
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
    include: { room: { include: { roomType: true } } },
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
    roomType: app.room.roomType.name,
    roomSize: app.room.roomType.sizeLabel,
    plan: app.plan,
    monthlyRent: app.room.roomType.monthlyPrice,
    deposit: app.room.roomType.monthlyPrice * s.depositMonths,
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

/**
 * An application that expired or was cancelled never became a contract, so
 * nothing justifies keeping the person's data: KTP number and photo, date of
 * birth, signature, unsigned contract and password are erased. The row stays
 * (it may be referenced by an expired invoice) with only its reference left.
 */
export async function scrubClosedApplications() {
  const closed = await prisma.application.findMany({
    where: {
      status: { in: [ApplicationStatus.EXPIRED, ApplicationStatus.CANCELLED] },
      OR: [{ idNumberEnc: { not: null } }, { ktpObjectKey: { not: null } }, { fullName: { not: null } }],
    },
    select: { id: true, ktpObjectKey: true, signatureKey: true, contractKey: true },
    take: 200,
  });

  for (const app of closed) {
    for (const key of [app.ktpObjectKey, app.signatureKey, app.contractKey]) {
      if (key) await deleteObject(key).catch(() => undefined);
    }
    await prisma.application.update({
      where: { id: app.id },
      data: {
        fullName: null,
        phoneE164: null,
        dateOfBirth: null,
        idNumberEnc: null,
        idLast4: null,
        ktpObjectKey: null,
        signatureKey: null,
        contractKey: null,
        contractHash: null,
        passwordHash: null,
        signedIp: null,
        signedAgent: null,
      },
    });
  }
  return closed.length;
}
