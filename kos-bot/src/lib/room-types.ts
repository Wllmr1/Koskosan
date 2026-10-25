import type { Photo, Room, RoomType } from "@prisma/client";
import { niceDate } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export type Availability = { free: number; nextFree: Date | null };

/** Hidden rooms never count. nextFree = earliest date an occupied or booked room opens up. */
export function availabilityOf(rooms: Pick<Room, "status" | "availableOn" | "hidden">[]): Availability {
  const visible = rooms.filter((r) => !r.hidden);
  const free = visible.filter((r) => r.status === "AVAILABLE").length;
  const dates = visible
    .filter((r) => r.status !== "AVAILABLE" && r.status !== "MAINTENANCE" && r.availableOn)
    .map((r) => r.availableOn as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  return { free, nextFree: dates[0] ?? null };
}

export function availabilityLabel(a: Availability): string {
  if (a.free > 0) return `${a.free} kamar tersedia`;
  return a.nextFree ? `Penuh · kosong mulai ${niceDate(a.nextFree)}` : "Penuh";
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
