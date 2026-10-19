import { NextRequest, NextResponse } from "next/server";
import { getObject } from "@/lib/storage";
import { PHOTO_NAME } from "@/lib/photos";

export const runtime = "nodejs";

/** Public, immutable (every upload gets a new random name). Only photos/ — never KTP or contracts. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!PHOTO_NAME.test(name)) return new NextResponse("not found", { status: 404 });
  try {
    const body = await getObject(`photos/${name}`);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
