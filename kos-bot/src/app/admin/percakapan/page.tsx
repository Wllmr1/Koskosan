import { redirect } from "next/navigation";
import { MessageRole } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { guardReply } from "@/lib/chat/rules";
import { stripLog } from "@/lib/chat/assistant";
import { parseActions } from "@/lib/chat/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Percakapan", robots: { index: false, follow: false } };

/** Masks full ID and phone numbers in anything a visitor typed, before the owner sees it. */
const mask = (text: string) => guardReply(text, env().APP_URL).text;

/**
 * Read-only transcripts so the owner can see what people ask and how the
 * assistant answers. Prospect chats disappear 24 hours after their last message.
 */
export default async function ConversationsPage() {
  await requireAdmin();

  const contacts = await prisma.contact.findMany({
    where: { conversations: { some: { messages: { some: {} } } } },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { tenant: { include: { leases: { where: { status: "ACTIVE" }, include: { room: true }, take: 1 } } } },
  });

  const transcripts = await Promise.all(
    contacts.map((c) =>
      prisma.message.findMany({
        where: { conversation: { contactId: c.id } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 60,
        select: { id: true, role: true, content: true, toolLog: true, actions: true, createdAt: true },
      })
    )
  );
  // Blocked manipulation attempts, and replies the output filter had to change.
  const audit = await prisma.auditLog.findMany({
    where: { contactId: { in: contacts.map((c) => c.id) }, action: { in: ["blocked:injection", "reply"] } },
    select: { contactId: true, action: true, meta: true },
  });
  const flags = audit.filter(
    (row) => row.action === "blocked:injection" || Boolean((row.meta as { filtered?: unknown } | null)?.filtered)
  );

  return (
    <main className="wrap" style={{ padding: "26px 20px 60px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24 }}>Percakapan</h1>
        <a className="btn" href="/admin" style={{ marginLeft: "auto" }}>← Dashboard</a>
      </header>
      <p className="muted small" style={{ marginTop: 0 }}>
        50 percakapan terakhir. Chat calon penghuni otomatis terhapus 24 jam setelah pesan terakhir. Nomor KTP dan HP disamarkan.
      </p>

      {contacts.length === 0 && <p className="muted">Belum ada percakapan.</p>}

      {contacts.map((c, i) => {
        const lease = c.tenant?.leases[0];
        const who = c.tenant ? `${c.tenant.fullName}${lease ? ` · kamar ${lease.room.code}` : ""}` : c.displayName ?? "Pengunjung";
        const flagCount = flags.filter((f) => f.contactId === c.id).length;
        return (
          <details key={c.id} className="card" style={{ padding: "14px 18px", marginBottom: 10 }}>
            <summary style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{who}</strong>
              <span className="pill pill-mute">{c.channel === "WEB" ? "situs" : "WhatsApp"}</span>
              <span className="pill pill-mute">{c.type === "MEMBER" ? "penghuni" : "calon"}</span>
              {flagCount > 0 && <span className="pill pill-warn">{flagCount} ditandai</span>}
              <time className="small muted" style={{ marginLeft: "auto" }}>
                {c.lastMessageAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {transcripts[i].map((m) => {
                const tools = Array.isArray(m.toolLog) ? (m.toolLog as { tool: string; ok: boolean }[]) : [];
                const actions = parseActions(m.actions);
                return (
                  <div key={m.id} className={`chat-bubble chat-${m.role === MessageRole.USER ? "user" : "assistant"}`} style={{ maxWidth: "80%" }}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{mask(m.role === MessageRole.USER ? m.content : stripLog(m.content))}</div>
                    {(tools.length > 0 || actions.length > 0) && (
                      <div className="small" style={{ marginTop: 6, opacity: 0.75 }}>
                        {tools.map((t) => `${t.tool}${t.ok ? "" : " (gagal)"}`).join(", ")}
                        {actions.length > 0 && ` · tombol: ${actions.map((a) => a.label).join(", ")}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </main>
  );
}
