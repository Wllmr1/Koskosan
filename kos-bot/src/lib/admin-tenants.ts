import { LeasePlan, LeaseStatus, RoomStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { encrypt } from "./crypto";
import { firstOfMonth, normalizePhone } from "./money";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format tanggal salah");

export const existingTenantSchema = z
  .object({
    fullName: z.string().trim().min(3).max(80).refine((v) => v.split(/\s+/).length >= 2, "tulis nama lengkap sesuai KTP"),
    phone: z.string().transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "nomor HP tidak valid" });
      return p ?? "";
    }),
    dateOfBirth: date,
    idNumber: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 16, "nomor KTP harus 16 digit"),
    roomId: z.string().min(1).max(40),
    plan: z.nativeEnum(LeasePlan),
    monthlyRent: z.coerce.number().int().min(100_000).max(100_000_000),
    deposit: z.coerce.number().int().min(0).max(100_000_000),
    startDate: date,
    endDate: date,
  })
  .refine((v) => v.endDate > v.startDate, { message: "tanggal selesai harus setelah tanggal mulai", path: ["endDate"] });

export type ExistingTenantInput = z.infer<typeof existingTenantSchema>;

export function parseExistingTenant(form: FormData) {
  return existingTenantSchema.safeParse(Object.fromEntries(form.entries()));
}

async function nextAccountCode(): Promise<string> {
  let n = (await prisma.tenant.count()) + 1;
  // Never reuse a code, even if rows were removed.
  while (await prisma.tenant.findUnique({ where: { accountCode: `WA-${String(n).padStart(4, "0")}` } })) n++;
  return `WA-${String(n).padStart(4, "0")}`;
}

/**
 * A renter who signed on paper before this system: creates their account and
 * active lease and marks the room occupied. No password yet — the owner sends
 * a setup link afterwards. Errors are written for the owner, in Indonesian.
 */
export async function addExistingTenant(input: ExistingTenantInput, contractKey: string | null, actor: string) {
  if (await prisma.tenant.findUnique({ where: { phoneE164: input.phone } })) {
    throw new Error("Nomor HP ini sudah terdaftar sebagai penghuni.");
  }
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room) throw new Error("Kamar tidak ditemukan.");
  if (await prisma.lease.findFirst({ where: { roomId: room.id, status: LeaseStatus.ACTIVE }, select: { id: true } })) {
    throw new Error(`Kamar ${room.code} sudah ada penghuni aktif.`);
  }

  const accountCode = await nextAccountCode();
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        accountCode,
        fullName: input.fullName,
        phoneE164: input.phone,
        dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
        idNumberEnc: encrypt(input.idNumber),
        idLast4: input.idNumber.slice(-4),
      },
    });
    const lease = await tx.lease.create({
      data: {
        tenantId: tenant.id,
        roomId: room.id,
        plan: input.plan,
        monthlyRent: input.monthlyRent,
        deposit: input.deposit,
        startDate: new Date(`${input.startDate}T00:00:00Z`),
        endDate: new Date(`${input.endDate}T00:00:00Z`),
        status: LeaseStatus.ACTIVE,
        signedAt: new Date(`${input.startDate}T00:00:00Z`),
        contractKey,
      },
    });
    await tx.room.update({ where: { id: room.id }, data: { status: RoomStatus.OCCUPIED, availableOn: null } });
    const settings = await tx.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
    await tx.utilityPeriod.upsert({
      where: { roomId_period: { roomId: room.id, period: firstOfMonth() } },
      create: { roomId: room.id, period: firstOfMonth(), quotaKwh: settings.electricQuota, ratePerKwh: settings.electricRate },
      update: {},
    });
    return { tenant, lease };
  });

  await prisma.auditLog.create({
    data: { actor, action: "tenant:add-existing", tenantId: result.tenant.id, meta: { room: room.code } as never },
  });
  return { ...result, room };
}
