import { prisma } from "@/lib/prisma";
import OpenChatButton from "@/components/OpenChatButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FaqPage() {
  const faq = await prisma.faqEntry.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <section className="page faq" style={{ maxWidth: 860, marginInline: "auto" }}>
      <div className="sec-head">
        <div className="lbl">FAQ</div>
        <h1>Pertanyaan umum.</h1>
        <p>
          Asisten menjawab dari daftar yang sama. Tidak menemukan jawabannya?{" "}
          <OpenChatButton className="chat-link" text="Halo, saya punya pertanyaan">Tanya asisten</OpenChatButton>.
        </p>
      </div>
      <div>
        {faq.length === 0 && <p style={{ color: "var(--ink-2)" }}>Belum ada isi.</p>}
        {faq.map((entry, i) => (
          <details key={entry.id} open={i === 0}>
            <summary>{entry.question}</summary>
            <p>{entry.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
