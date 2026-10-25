import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { processPhoto } from "../src/lib/photos";
import { prisma } from "../src/lib/prisma";
import { putObject } from "../src/lib/storage";

/** Longest prefix first, so "vip-a-1.jpg" never matches a shorter slug. */
const PREFIXES = ["standard-new-", "new-deluxe-", "vip-a-", "vip-1-", "vip-2-", "standar-", "deluxe-"];
const IMAGE = /\.(jpe?g|png|webp)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Imports the owner's real photos from a folder. A file belongs to the room
 * type named by its prefix ("vip-a-2.jpg" -> VIP A). A type that already has
 * photos is left alone, so running this twice changes nothing.
 */
export async function importPhotos(folder: string): Promise<{ imported: number; skipped: string[] }> {
  let names: string[];
  try {
    names = (await fs.readdir(folder)).sort();
  } catch {
    return { imported: 0, skipped: [] };
  }

  const skipped: string[] = [];
  const bySlug = new Map<string, string[]>();
  for (const name of names) {
    const prefix = IMAGE.test(name) ? PREFIXES.find((p) => name.toLowerCase().startsWith(p)) : undefined;
    if (!prefix) {
      skipped.push(name);
      continue;
    }
    const slug = prefix.slice(0, -1);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), name]);
  }

  let imported = 0;
  for (const [slug, files] of bySlug) {
    const type = await prisma.roomType.findUnique({ where: { slug }, include: { _count: { select: { photos: true } } } });
    if (!type || type._count.photos > 0) {
      skipped.push(...files);
      continue;
    }
    for (const [index, file] of files.entries()) {
      const ext = path.extname(file).slice(1).toLowerCase();
      const { data, width, height } = await processPhoto(await fs.readFile(path.join(folder, file)), TYPES[ext]);
      const key = `photos/${crypto.randomBytes(12).toString("base64url")}.webp`;
      await putObject(key, data, "image/webp");
      await prisma.photo.create({
        data: { roomTypeId: type.id, caption: type.name, key, width, height, sortOrder: index, isCover: index === 0 },
      });
      imported += 1;
    }
  }
  return { imported, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage: npx tsx prisma/import-photos.ts <folder>");
    process.exit(1);
  }
  importPhotos(folder)
    .then((result) => console.log(result))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
