import { NextRequest, NextResponse } from "next/server";
import { RoomStatus } from "@prisma/client";
import { z } from "zod";
import { ownerPostGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  roomId: z.string().min(1).max(40),
  status: z.nativeEnum(RoomStatus),
  monthlyPrice: z.coerce.number().int().min(100_000).max(100_000_000),
  availableOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

/**
 * Owner updates a room's availability or price. The website and the assistant
 * both read this row, so the change is live everywhere at once.
 */
export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const parsed = schema.safeParse({
    roomId: form.get("roomId"),
    status: form.get("status"),
    monthlyPrice: form.get("monthlyPrice"),
    availableOn: form.get("availableOn") ?? "",
  });
  if (!parsed.success) return NextResponse.redirect(new URL("/admin?room=invalid#kamar", req.url), { status: 303 });

  const { roomId, status, monthlyPrice, availableOn } = parsed.data;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.redirect(new URL("/admin?room=invalid#kamar", req.url), { status: 303 });

  // A room with a live tenant cannot be put back on the market from here.
  const activeLease = await prisma.lease.findFirst({ where: { roomId, status: "ACTIVE" }, select: { id: true } });
  if (activeLease && status === RoomStatus.AVAILABLE) {
    return NextResponse.redirect(new URL("/admin?room=occupied#kamar", req.url), { status: 303 });
  }

  await prisma.$transaction([
    prisma.room.update({
      where: { id: roomId },
      data: {
        status,
        availableOn: status === RoomStatus.AVAILABLE || !availableOn ? null : new Date(`${availableOn}T00:00:00Z`),
      },
    }),
    // The price belongs to the room type, so every room of that type changes with it.
    prisma.roomType.update({ where: { id: room.roomTypeId }, data: { monthlyPrice } }),
  ]);
  await prisma.auditLog.create({
    data: {
      actor: "owner",
      action: "room:update",
      meta: { room: room.code, from: room.status, to: status, price: monthlyPrice } as never,
    },
  });

  return NextResponse.redirect(new URL("/admin?room=saved#kamar", req.url), { status: 303 });
}
