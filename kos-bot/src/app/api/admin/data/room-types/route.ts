import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { backTo, ownerPostGuard } from "@/lib/admin-guard";
import { removePhoto } from "@/lib/photos";
import { firstIssue, parseRoomType } from "@/lib/admin-forms";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  const id = String(form.get("id") ?? "");
  const back = (query: string) => backTo(req, id && op !== "delete" ? `/admin/data/tipe/${id}` : "/admin/data/tipe", query);
  const fail = (message: string) => backTo(req, id ? `/admin/data/tipe/${id}` : "/admin/data/tipe", `error=${encodeURIComponent(message)}`);

  if (op === "delete") {
    const type = await prisma.roomType.findUnique({ where: { id }, include: { _count: { select: { rooms: true } } } });
    if (!type) return fail("Tipe tidak ditemukan");
    if (type._count.rooms) return fail("Tipe ini masih punya kamar — pindahkan kamarnya dulu");
    for (const photo of await prisma.photo.findMany({ where: { roomTypeId: id }, select: { id: true } })) await removePhoto(photo.id);
    await prisma.roomType.delete({ where: { id } });
    await prisma.auditLog.create({ data: { actor: "owner", action: "data:room-type:delete", meta: { type: type.slug } as never } });
    return back("saved=1");
  }

  if (op !== "save") return fail("Aksi tidak dikenal");
  const parsed = parseRoomType(form);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  try {
    if (id) {
      if (!(await prisma.roomType.findUnique({ where: { id }, select: { id: true } }))) return fail("Tipe tidak ditemukan");
      const type = await prisma.roomType.update({ where: { id }, data: parsed.data });
      await prisma.auditLog.create({ data: { actor: "owner", action: "data:room-type:update", meta: { type: type.slug } as never } });
      return back("saved=1");
    }
    const type = await prisma.roomType.create({ data: parsed.data });
    await prisma.auditLog.create({ data: { actor: "owner", action: "data:room-type:create", meta: { type: type.slug } as never } });
    return backTo(req, `/admin/data/tipe/${type.id}`, "saved=1");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Nama atau alamat (slug) sudah dipakai tipe lain");
    throw e;
  }
}
