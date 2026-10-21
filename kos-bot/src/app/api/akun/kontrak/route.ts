import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObject } from "@/lib/storage";
import { RENTER_COOKIE, renterFromCookie } from "@/lib/renter-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The logged-in renter's own signed contract (latest lease). Nobody else's, ever. */
export async function GET(req: NextRequest) {
  const renter = await renterFromCookie(req.cookies.get(RENTER_COOKIE)?.value);
  if (!renter) return new NextResponse("unauthorized", { status: 401 });

  const lease = await prisma.lease.findFirst({
    where: { tenantId: renter.id, contractKey: { not: null } },
    orderBy: { startDate: "desc" },
    include: { room: { select: { code: true } } },
  });
  if (!lease?.contractKey) return new NextResponse("not found", { status: 404 });

  try {
    const pdf = await getObject(lease.contractKey);
    await prisma.auditLog.create({ data: { actor: "tenant", action: "contract:download", tenantId: renter.id } });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="kontrak-${lease.room.code}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
