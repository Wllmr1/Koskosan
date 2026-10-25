import { Channel, ContactType, RoomStatus } from "@prisma/client";
import type { Room, RoomType } from "@prisma/client";
import type { ChatCtx } from "@/lib/chat/context";
import { prisma } from "@/lib/prisma";

/** A chat context for tests. Defaults to an anonymous website visitor. */
export function makeCtx(over: Partial<ChatCtx> = {}): ChatCtx {
  return {
    contactId: "test-contact",
    conversationId: "test-conversation",
    channel: Channel.WEB,
    waId: null,
    phoneE164: null,
    name: null,
    type: ContactType.PROSPECT,
    tenantId: null,
    accountCode: null,
    roomCode: null,
    verified: false,
    handoff: false,
    blocked: false,
    actions: [],
    ...over,
  };
}

let counter = 0;
/**
 * Unique per test run and per call. The test database is never wiped, so
 * every unique column (codes, phones, ids) a test writes must come from here.
 */
export function uniq(): string {
  counter += 1;
  return `${Date.now().toString().slice(-7)}${String(counter).padStart(2, "0")}`;
}

/**
 * One room, available by default, of its own uniquely named room type (unless
 * `type.id` names an existing one). The type defaults can be overridden.
 */
export async function makeRoom(
  over: { status?: RoomStatus; hidden?: boolean; availableOn?: Date | null; type?: Partial<RoomType> } = {},
): Promise<Room & { roomType: RoomType }> {
  const id = uniq();
  let roomTypeId = over.type?.id;
  if (!roomTypeId) {
    const { id: _ignored, ...fields } = over.type ?? {};
    const type = await prisma.roomType.create({
      data: {
        slug: `tipe-${id}`,
        name: `Tipe ${id}`,
        sizeLabel: "3 × 3 m",
        monthlyPrice: 1_000_000,
        bathroom: "Kamar mandi luar",
        extras: "AC",
        ...fields,
      },
    });
    roomTypeId = type.id;
  }
  return prisma.room.create({
    data: {
      code: `T${id}`.slice(0, 12),
      roomTypeId,
      floor: 1,
      status: over.status ?? RoomStatus.AVAILABLE,
      hidden: over.hidden ?? false,
      availableOn: over.availableOn ?? null,
    },
    include: { roomType: true },
  });
}
