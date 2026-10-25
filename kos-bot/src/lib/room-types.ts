import type { Photo, Room, RoomType } from "@prisma/client";
import { niceDate } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export type Availability = { free: number; nextFree: Date | null };

/** Midnight UTC of `now`'s calendar day — the date form used for move-ins. */
const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** A "free from" date never shows as in the past: a date before today reads as today. */
export function notBeforeToday(date: Date, now = new Date()): Date {
  const today = startOfDay(now);
  return date.getTime() < today.getTime() ? today : date;
}

/**
 * Hidden rooms never count. nextFree = earliest date an occupied room with a
 * known leaving date opens up (never before today) — the only kind of full
 * room the rent flow can book ahead (see roomOpenOn). Booked and maintenance
 * rooms never give a date.
 */
export function availabilityOf(rooms: Pick<Room, "status" | "availableOn" | "hidden">[], now = new Date()): Availability {
  const visible = rooms.filter((r) => !r.hidden);
  const free = visible.filter((r) => r.status === "AVAILABLE").length;
  const dates = visible
    .filter((r) => r.status === "OCCUPIED" && r.availableOn)
    .map((r) => r.availableOn as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  return { free, nextFree: dates[0] ? notBeforeToday(dates[0], now) : null };
}

export function availabilityLabel(a: Availability, now = new Date()): string {
  if (a.free > 0) return `${a.free} kamar tersedia`;
  return a.nextFree ? `Penuh · kosong mulai ${niceDate(notBeforeToday(a.nextFree, now))}` : "Penuh";
}

export function tagsOf(t: Pick<RoomType, "isNew" | "isVip" | "hasEnsuite">): string[] {
  const tags = [t.isNew ? "Kos baru" : "Kos lama"];
  if (t.isVip) tags.push("VIP");
  if (t.hasEnsuite) tags.push("Kamar mandi dalam");
  return tags;
}

export type TypeCard = RoomType & { availability: Availability; photos: Photo[] };

const withRooms = {
  rooms: { where: { hidden: false }, select: { status: true, availableOn: true, hidden: true } },
  photos: { orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }] },
};

function toCard(t: RoomType & { rooms: Pick<Room, "status" | "availableOn" | "hidden">[]; photos: Photo[] }): TypeCard {
  const { rooms, ...type } = t;
  return { ...type, availability: availabilityOf(rooms) };
}

/** Room types that have at least one visible room, in display order. */
export async function listRoomTypes(): Promise<TypeCard[]> {
  const types = await prisma.roomType.findMany({
    where: { rooms: { some: { hidden: false } } },
    include: withRooms,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return types.map(toCard);
}

export async function getRoomType(slug: string): Promise<TypeCard | null> {
  const type = await prisma.roomType.findFirst({
    where: { slug, rooms: { some: { hidden: false } } },
    include: withRooms,
  });
  return type ? toCard(type) : null;
}

export type KamarPath = { kind: "type"; type: TypeCard } | { kind: "redirect"; to: string };

/**
 * What /kamar/<param> means: a type slug, the same slug in another case (sent
 * to the canonical URL), an old room code (sent to its type), or nothing.
 * `query` (e.g. "?masuk=2027-01-15") is kept on any redirect.
 */
export async function resolveKamarPath(param: string, query = ""): Promise<KamarPath | null> {
  if (!/^[A-Za-z0-9-]{1,60}$/.test(param)) return null;
  const type = await getRoomType(param);
  if (type) return { kind: "type", type };
  const tail = query && query !== "?" ? (query.startsWith("?") ? query : `?${query}`) : "";
  const sameSlug = await prisma.roomType.findFirst({
    where: { slug: { equals: param, mode: "insensitive" }, rooms: { some: { hidden: false } } },
    select: { slug: true },
  });
  if (sameSlug) return { kind: "redirect", to: `/kamar/${sameSlug.slug}${tail}` };
  const room = await prisma.room.findFirst({
    where: { code: param.toUpperCase(), hidden: false },
    select: { roomType: { select: { slug: true } } },
  });
  return room ? { kind: "redirect", to: `/kamar/${room.roomType.slug}${tail}` } : null;
}

/** A page's searchParams as a "?a=1&b=2" string ("" when there are none). */
export function queryString(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, one);
  return q.size ? `?${q}` : "";
}

/** A YYYY-MM-DD string that is a real calendar date, else null. */
export function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}
