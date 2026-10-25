import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { TOOLS } from "@/lib/chat/tools";
import { makeCtx, makeRoom } from "../helpers";

afterAll(() => prisma.$disconnect());

const search = TOOLS.find((t) => t.name === "search_rooms")!;
type Result = { room: string; type: string };
const run = async (input: Record<string, unknown>) =>
  ((await search.run(input, makeCtx())) as { results: Result[] }).results;

describe("search_rooms filters", () => {
  it("applies the type and the budget together", async () => {
    const a = await makeRoom({ type: { monthlyPrice: 150_000 } });
    const b = await makeRoom({ type: { monthlyPrice: 160_000 } });
    const results = await run({ type: a.roomType.name.toLowerCase(), max_price: 200_000 });
    expect(results.map((r) => r.room)).toEqual([a.code]);
    expect(results.map((r) => r.room)).not.toContain(b.code);
  });

  it("applies the budget to the type's price", async () => {
    const dear = await makeRoom({ type: { monthlyPrice: 9_000_000 } });
    const results = await run({ max_price: 5_000_000 });
    expect(results.map((r) => r.room)).not.toContain(dear.code);
    for (const r of results) {
      const room = await prisma.room.findUniqueOrThrow({ where: { code: r.room }, include: { roomType: true } });
      expect(room.roomType.monthlyPrice).toBeLessThanOrEqual(5_000_000);
    }
  });

  it("filters by type alone", async () => {
    const a = await makeRoom();
    await makeRoom();
    const results = await run({ type: a.roomType.name });
    expect(results.map((r) => r.room)).toEqual([a.code]);
  });
});
