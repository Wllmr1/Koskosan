import { prisma } from "@/lib/prisma";
import OpenChatButton from "@/components/OpenChatButton";
import { PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FaqPage() {
  const faq = await prisma.faqEntry.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHead title="Pertanyaan umum" sub="Asisten menjawab dari daftar yang sama." />
      <Section title={`${faq.length} pertanyaan`}>
        {faq.length === 0 && <p className="muted small">Belum ada isi.</p>}
        {faq.map((entry) => (
          <details key={entry.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{entry.question}</summary>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 15 }}>{entry.answer}</p>
          </details>
        ))}
      </Section>
      <p className="muted small">
        Pertanyaannya tidak ada di sini? <OpenChatButton className="chat-link">Tanya lewat chat</OpenChatButton>
      </p>
    </>
  );
}
