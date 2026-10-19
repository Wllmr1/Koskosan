import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { backTo, ownerPostGuard } from "@/lib/admin-guard";
import { firstIssue, LIST_KINDS, parseListItem, type ListKind } from "@/lib/admin-forms";

export const runtime = "nodejs";

type Row = { id: string; sortOrder: number };
type ListStore = {
  rows(): Promise<Row[]>;
  create(a: string, b: string, sortOrder: number): Promise<unknown>;
  update(id: string, a: string, b: string): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  setOrder(id: string, sortOrder: number): Promise<unknown>;
};

/** One adapter per table, so the route below never touches a dynamic Prisma delegate. */
function store(kind: ListKind): ListStore {
  const order = { orderBy: { sortOrder: "asc" as const }, select: { id: true, sortOrder: true } };
  switch (kind) {
    case "layanan":
      return {
        rows: () => prisma.service.findMany(order),
        create: (a, b, sortOrder) => prisma.service.create({ data: { name: a, priceNote: b, sortOrder } }),
        update: (id, a, b) => prisma.service.update({ where: { id }, data: { name: a, priceNote: b } }),
        remove: (id) => prisma.service.delete({ where: { id } }),
        setOrder: (id, sortOrder) => prisma.service.update({ where: { id }, data: { sortOrder } }),
      };
    case "sekitar":
      return {
        rows: () => prisma.nearbyPlace.findMany(order),
        create: (a, b, sortOrder) => prisma.nearbyPlace.create({ data: { name: a, distance: b, sortOrder } }),
        update: (id, a, b) => prisma.nearbyPlace.update({ where: { id }, data: { name: a, distance: b } }),
        remove: (id) => prisma.nearbyPlace.delete({ where: { id } }),
        setOrder: (id, sortOrder) => prisma.nearbyPlace.update({ where: { id }, data: { sortOrder } }),
      };
    case "faq":
      return {
        rows: () => prisma.faqEntry.findMany(order),
        create: (a, b, sortOrder) => prisma.faqEntry.create({ data: { question: a, answer: b, sortOrder } }),
        update: (id, a, b) => prisma.faqEntry.update({ where: { id }, data: { question: a, answer: b } }),
        remove: (id) => prisma.faqEntry.delete({ where: { id } }),
        setOrder: (id, sortOrder) => prisma.faqEntry.update({ where: { id }, data: { sortOrder } }),
      };
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const denied = await ownerPostGuard(req);
  if (denied) return denied;

  const { kind } = await ctx.params;
  if (!(kind in LIST_KINDS)) return backTo(req, "/admin/data");
  const s = store(kind as ListKind);
  const path = `/admin/data/${kind}`;

  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  const id = String(form.get("id") ?? "");
  const rows = await s.rows();

  if (op === "create" || op === "update") {
    const parsed = parseListItem(form);
    if (!parsed.success) return backTo(req, path, `error=${encodeURIComponent(firstIssue(parsed.error))}`);
    if (op === "create") await s.create(parsed.data.a, parsed.data.b, (rows.at(-1)?.sortOrder ?? -1) + 1);
    else if (rows.some((r) => r.id === id)) await s.update(id, parsed.data.a, parsed.data.b);
  } else if (op === "delete" && rows.some((r) => r.id === id)) {
    await s.remove(id);
  } else if (op === "up" || op === "down") {
    // Renumber 0..n so swaps always work even if old rows share a sortOrder.
    const index = rows.findIndex((r) => r.id === id);
    const swap = op === "up" ? index - 1 : index + 1;
    if (index >= 0 && swap >= 0 && swap < rows.length) {
      const ordered = rows.map((r) => r.id);
      [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
      for (const [i, rowId] of ordered.entries()) await s.setOrder(rowId, i);
    }
  }

  await prisma.auditLog.create({ data: { actor: "owner", action: `data:${kind}:${op}` } });
  return backTo(req, path, "saved=1");
}
