import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import ListEditor from "@/components/admin/ListEditor";

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const q = await searchParams;
  const rows = await prisma.faqEntry.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <ListEditor kind="faq" rows={rows.map((r) => ({ id: r.id, a: r.question, b: r.answer }))} />
    </>
  );
}
