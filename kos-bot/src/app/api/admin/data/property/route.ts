import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { backTo, ownerPostGuard } from "@/lib/admin-guard";
import { firstIssue, parseProperty } from "@/lib/admin-forms";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const parsed = parseProperty(await req.formData());
  if (!parsed.success) return backTo(req, "/admin/data", `error=${encodeURIComponent(firstIssue(parsed.error))}`);

  await prisma.propertySetting.update({
    where: { id: "default" },
    data: { ...parsed.data, mapsUrl: parsed.data.mapsUrl || null },
  });
  await prisma.auditLog.create({ data: { actor: "owner", action: "data:property" } });
  return backTo(req, "/admin/data", "saved=1");
}
