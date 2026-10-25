import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { backTo, adminPostGuard, auditActor } from "@/lib/admin-guard";
import { addPhoto, movePhoto, removePhoto, setCover } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  const backParam = String(form.get("back") ?? "");
  const back = /^\/admin\/data(\/[A-Za-z0-9/_-]*)?$/.test(backParam) ? backParam : "/admin/data/foto";
  const done = (query: string) => backTo(req, back, query);

  if (op === "upload") {
    const roomTypeId = String(form.get("roomTypeId") ?? "") || null;
    if (roomTypeId && !(await prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { id: true } }))) {
      return done(`error=${encodeURIComponent("Tipe kamar tidak ditemukan")}`);
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 12);
    if (!files.length) return done(`error=${encodeURIComponent("Pilih foto dulu")}`);
    const caption = String(form.get("caption") ?? "");
    const failed: string[] = [];
    for (const file of files) {
      try {
        await addPhoto({ roomTypeId, file, caption });
      } catch (e) {
        failed.push(`${file.name.slice(0, 40)}: ${(e as Error).message}`);
      }
    }
    await prisma.auditLog.create({ data: { actor: await auditActor(), action: "photo:upload", meta: { roomTypeId, count: files.length - failed.length } as never } });
    return failed.length ? done(`error=${encodeURIComponent(failed.join("; "))}`) : done("saved=1");
  }

  const id = String(form.get("id") ?? "");
  if (!(await prisma.photo.findUnique({ where: { id }, select: { id: true } }))) {
    return done(`error=${encodeURIComponent("Foto tidak ditemukan")}`);
  }
  if (op === "caption") await prisma.photo.update({ where: { id }, data: { caption: String(form.get("caption") ?? "").trim().slice(0, 140) } });
  else if (op === "cover") await setCover(id);
  else if (op === "up") await movePhoto(id, -1);
  else if (op === "down") await movePhoto(id, 1);
  else if (op === "delete") await removePhoto(id);
  else return done(`error=${encodeURIComponent("Aksi tidak dikenal")}`);

  await prisma.auditLog.create({ data: { actor: await auditActor(), action: `photo:${op}`, meta: { id } as never } });
  return done("saved=1");
}
