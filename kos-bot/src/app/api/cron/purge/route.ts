import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { safeEqual } from "@/lib/crypto";
import { purgeChatMemory, purgeExpiredDocuments } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const memory = await purgeChatMemory();
  const documents = await purgeExpiredDocuments();
  return NextResponse.json({ ok: true, memory, documents });
}
