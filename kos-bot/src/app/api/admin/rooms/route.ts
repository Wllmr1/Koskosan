import { NextRequest, NextResponse } from "next/server";
import { RoomStatus } from "@prisma/client";
import { z } from "zod";
import { adminPostGuard, auditActor } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  roomId: z.string().min(1).max(40),
  status: z.nativeEnum(RoomStatus),
  availableOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

/**
 * Owner updates a room's availability. The website and the assistant
 * both read this row, so the change is live everywhere at once.
 */
export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const parsed = schema.safeParse({
    roomId: form.get("roomId"),
    status: form.get("status"),
    availableOn: form.get("availableOn") ?? "",
  });
  if (!parsed.success) return NextResponse.redirect(new URL("/admin?room=invalid#kamar", req.url), { status: 303 });

  const { roomId, status, availableOn } = parsed.data;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.redirect(new URL("/admin?room=invalid#kamar", req.url), { status: 303 });

  // A room with a live tenant cannot be put back on the market from here.
  const activeLease = await prisma.lease.findFirst({ where: { roomId, status: "ACTIVE" }, select: { id: true } });
  if (activeLease && status === RoomStatus.AVAILABLE) {
    return NextResponse.redirect(new URL("/admin?room=occupied#kamar", req.url), { status: 303 });
  }

  await prisma.room.update({
    where: { id: roomId },
    data: {
      status,
      availableOn: status === RoomStatus.AVAILABLE || !availableOn ? null : new Date(`${availableOn}T00:00:00Z`),
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: await auditActor(),
      action: "room:update",
      meta: { room: room.code, from: room.status, to: status } as never,
    },
  });

  return NextResponse.redirect(new URL("/admin?room=saved#kamar", req.url), { status: 303 });
}
