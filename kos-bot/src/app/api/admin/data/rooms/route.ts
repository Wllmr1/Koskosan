import { NextRequest } from "next/server";
import { Prisma, RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { backTo, ownerPostGuard } from "@/lib/admin-guard";
import { firstIssue, parseRoom } from "@/lib/admin-forms";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tipe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  const id = String(form.get("id") ?? "");
  const back = (query: string) => backTo(req, id && op !== "delete" ? `/admin/data/kamar/${id}` : "/admin/data/kamar", query);
  const fail = (message: string) => back(`error=${encodeURIComponent(message)}`);

  if (op === "delete") {
    const room = await prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { leases: true, applications: true } } },
    });
    if (!room) return fail("Kamar tidak ditemukan");
    if (room._count.leases || room._count.applications) {
      return backTo(req, `/admin/data/kamar/${id}`, `error=${encodeURIComponent("Kamar ini punya riwayat kontrak — sembunyikan saja")}`);
    }
    await prisma.room.delete({ where: { id } });
    await prisma.auditLog.create({ data: { actor: "owner", action: "data:room:delete", meta: { room: room.code } as never } });
    return back("saved=1");
  }

  const parsed = parseRoom(form);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { availableOn, type, sizeLabel, monthlyPrice, bathroom, extras, description, ...rest } = parsed.data;
  // Until the type editor arrives (Task 3), the room form still carries the type fields:
  // they create or update the room type with that name.
  const typeFields = { sizeLabel, monthlyPrice, bathroom, extras, description };
  const roomType = await prisma.roomType.upsert({
    where: { slug: slugify(type) },
    create: { slug: slugify(type), name: type, ...typeFields, hasEnsuite: /dalam/i.test(bathroom) },
    update: typeFields,
  });
  const data = {
    ...rest,
    roomTypeId: roomType.id,
    availableOn: rest.status === RoomStatus.AVAILABLE || !availableOn ? null : new Date(`${availableOn}T00:00:00Z`),
  };

  try {
    if (op === "create") {
      const room = await prisma.room.create({ data });
      await prisma.auditLog.create({ data: { actor: "owner", action: "data:room:create", meta: { room: room.code } as never } });
      return backTo(req, `/admin/data/kamar/${room.id}`, "saved=1");
    }
    if (op === "update") {
      const active = await prisma.lease.findFirst({ where: { roomId: id, status: "ACTIVE" }, select: { id: true } });
      if (active && data.status === RoomStatus.AVAILABLE) return fail("Kamar ini masih punya penghuni aktif");
      const room = await prisma.room.update({ where: { id }, data });
      await prisma.auditLog.create({ data: { actor: "owner", action: "data:room:update", meta: { room: room.code } as never } });
      return back("saved=1");
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Kode kamar sudah dipakai");
    throw e;
  }
  return fail("Aksi tidak dikenal");
}
