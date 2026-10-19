import crypto from "node:crypto";
import sharp from "sharp";
import { prisma } from "./prisma";
import { deleteObject, putObject, validateImage } from "./storage";

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1600;
/** 40 megapixels: enough for any phone photo, refuses decompression bombs. */
const MAX_INPUT_PIXELS = 40_000_000;
export const PHOTO_NAME = /^[A-Za-z0-9_-]{8,64}\.webp$/;

/**
 * Every uploaded photo is decoded and re-encoded: WEBP, longest side 1600px,
 * orientation applied, and all metadata (EXIF, GPS, camera serials) dropped —
 * sharp writes none unless asked.
 */
export async function processPhoto(input: Buffer, declaredType: string) {
  validateImage(input, declaredType, PHOTO_MAX_BYTES);
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export const photoUrl = (key: string) => `/${key}`;

/** Room photo (roomId) or property gallery photo (null). The first one becomes the cover. */
export async function addPhoto(opts: { roomId: string | null; file: File; caption: string }) {
  const { data, width, height } = await processPhoto(Buffer.from(await opts.file.arrayBuffer()), opts.file.type);
  const key = `photos/${crypto.randomBytes(12).toString("base64url")}.webp`;
  await putObject(key, data, "image/webp");
  const count = await prisma.photo.count({ where: { roomId: opts.roomId } });
  return prisma.photo.create({
    data: {
      roomId: opts.roomId,
      caption: opts.caption.trim().slice(0, 140),
      key,
      width,
      height,
      sortOrder: count,
      isCover: count === 0,
    },
  });
}

export async function removePhoto(id: string) {
  const photo = await prisma.photo.delete({ where: { id } });
  await deleteObject(photo.key).catch(() => undefined);
  if (photo.isCover) {
    const next = await prisma.photo.findFirst({ where: { roomId: photo.roomId }, orderBy: { sortOrder: "asc" } });
    if (next) await prisma.photo.update({ where: { id: next.id }, data: { isCover: true } });
  }
  return photo;
}

export async function setCover(id: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.photo.updateMany({ where: { roomId: photo.roomId }, data: { isCover: false } }),
    prisma.photo.update({ where: { id }, data: { isCover: true } }),
  ]);
  return photo;
}

export async function movePhoto(id: string, direction: -1 | 1) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id } });
  const siblings = await prisma.photo.findMany({ where: { roomId: photo.roomId }, orderBy: { sortOrder: "asc" } });
  const index = siblings.findIndex((p) => p.id === id);
  const swap = index + direction;
  if (swap < 0 || swap >= siblings.length) return photo;
  const ordered = siblings.map((p) => p.id);
  [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
  await prisma.$transaction(ordered.map((pid, i) => prisma.photo.update({ where: { id: pid }, data: { sortOrder: i } })));
  return photo;
}
