"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Action = { kind: "link"; label: string; path: string };
type Line = { role: "user" | "assistant"; text: string; actions: Action[] };
type Renter = { firstName: string } | null;

export const OPEN_CHAT_EVENT = "kos:open-chat";
const HIDDEN_ON = ["/admin", "/apply", "/dev", "/atur-password", "/masuk"];
const FALLBACK = "Maaf kak, sistemnya lagi bermasalah sebentar. Coba kirim ulang pesannya ya 🙏";
const GREETING: Line = {
  role: "assistant",
  text: "Halo kak 👋 Saya asisten kos ini. Mau cari kamar, tanya harga, atau soal sewa kakak?",
  actions: [],
};

export default function ChatWidget() {
  const pathname = usePathname() ?? "/";
  const hidden = HIDDEN_ON.some((p) => pathname.startsWith(p));

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [renter, setRenter] = useState<Renter>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openWith = useCallback((text?: string) => {
    setOpen(true);
    if (text) setDraft(text.slice(0, 600));
  }, []);

  // ?chat=1 opens the window (used by "Kembali ke chat"); ?tanya= pre-fills it.
  useEffect(() => {
    if (hidden) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") === "1") openWith(params.get("tanya") ?? undefined);
    const onOpen = (e: Event) => openWith((e as CustomEvent<{ text?: string }>).detail?.text);
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, [hidden, openWith]);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { messages?: Line[]; renter?: Renter }) => {
        setLines(json.messages ?? []);
        setRenter(json.renter ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines, busy, open]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setLines((l) => [...l, { role: "user", text, actions: [] }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const json = (await res.json()) as { reply?: string; actions?: Action[]; error?: string };
      setLines((l) => [...l, { role: "assistant", text: json.reply ?? json.error ?? FALLBACK, actions: json.actions ?? [] }]);
    } catch {
      setLines((l) => [...l, { role: "assistant", text: FALLBACK, actions: [] }]);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  if (!open) {
    return (
      <button type="button" className="chat-fab" onClick={() => setOpen(true)} aria-label="Buka chat">
        💬 <span>Chat</span>
      </button>
    );
  }

  const shown = lines.length ? lines : [GREETING];

  return (
    <section className="chat-panel" role="dialog" aria-label="Chat dengan asisten kos">
      <header className="chat-head">
        <div>
          <strong>Asisten kos</strong>
          <span className="small muted">
            {renter ? `Masuk sebagai ${renter.firstName}` : "Biasanya membalas dalam hitungan detik"}
          </span>
        </div>
        {renter ? (
          <form method="post" action="/api/auth/logout">
            <button className="chat-link" type="submit">Keluar</button>
          </form>
        ) : (
          <a className="chat-link" href="/masuk">Masuk penghuni</a>
        )}
        <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Tutup chat">
          ×
        </button>
      </header>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {shown.map((line, i) => (
          <div key={i} className={`chat-bubble chat-${line.role}`}>
            <Rich text={line.text} />
            {line.actions.length > 0 && (
              <div className="chat-actions">
                {line.actions.map((a) => (
                  <a key={a.path} className="btn btn-pri" href={a.path}>
                    {a.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="chat-bubble chat-assistant chat-typing">mengetik…</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={600}
          rows={1}
          placeholder="Tulis pesan…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn btn-pri" type="submit" disabled={busy || !draft.trim()}>
          Kirim
        </button>
      </form>
    </section>
  );
}

/** Plain text with line breaks; *single asterisks* become bold. Nothing else is interpreted. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*[^*\n]+\*)/g).map((part, j) =>
            /^\*[^*\n]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <Fragment key={j}>{part}</Fragment>
          )}
        </Fragment>
      ))}
    </>
  );
}
