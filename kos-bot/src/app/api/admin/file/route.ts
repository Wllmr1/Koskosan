import { auditActor } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only way to read a KTP photo or a signed contract. Dashboard logins only, and every
 * read is written to the audit log — so you can always answer "who opened this".
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("unauthorized", { status: 401 });

  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!/^(ktp|contracts|signatures)\/[A-Za-z0-9._-]+$/.test(key)) {
    return new NextResponse("invalid key", { status: 400 });
  }

  try {
    const body = await getObject(key);
    await prisma.auditLog.create({ data: { actor: await auditActor(), action: "file:read", meta: { key } as never } });
    const type = key.endsWith(".pdf")
      ? "application/pdf"
      : key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": type,
        "content-disposition": `inline; filename="${key.split("/").pop()}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
