import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import ListEditor from "@/components/admin/ListEditor";
import { requireAdmin } from "@/lib/auth";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const rows = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <ListEditor kind="layanan" rows={rows.map((r) => ({ id: r.id, a: r.name, b: r.priceNote }))} />
    </>
  );
}
