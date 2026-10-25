"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Action = { kind: "link"; label: string; path: string };
type Line = { role: "user" | "assistant"; text: string; actions: Action[] };
type Renter = { firstName: string } | null;
type Mode = "button" | "window" | "big";

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

  const [mode, setMode] = useState<Mode>("button");
  const open = mode !== "button";
  const [loaded, setLoaded] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [renter, setRenter] = useState<Renter>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openWith = useCallback((text?: string) => {
    setMode("window");
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

  // Escape minimises the window back to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("button");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      <div className="rk chat-root">
        <button type="button" className="kc-fab" onClick={() => setMode("window")}>
          Chat sekarang
        </button>
      </div>
    );
  }

  const shown = lines.length ? lines : [GREETING];
  const big = mode === "big";

  return (
    <div className="rk chat-root">
    <section className={`kc-win${big ? " big" : ""}`} role="dialog" aria-label="Chat dengan asisten kos">
      <header className="kc-head">
        <div className="kc-av" aria-hidden="true">RK</div>
        <div className="kc-title">
          <b>Asisten</b>
          <small>{renter ? `Masuk sebagai ${renter.firstName}` : "Biasanya membalas langsung"}</small>
          {renter ? (
            <form method="post" action="/api/auth/logout">
              <button className="chat-link" type="submit">Keluar</button>
            </form>
          ) : (
            <a className="chat-link" href="/masuk">Masuk penghuni</a>
          )}
        </div>
        <div className="kc-ctl">
          <button
            type="button"
            className="kc-big"
            onClick={() => setMode(big ? "window" : "big")}
            aria-label={big ? "Perkecil" : "Perbesar"}
            title={big ? "Perkecil" : "Perbesar"}
          >
            {big ? "⤡" : "⤢"}
          </button>
          <button type="button" onClick={() => setMode("button")} aria-label="Kecilkan" title="Kecilkan jadi tombol">
            –
          </button>
        </div>
      </header>

      <div className="kc-msgs" ref={listRef} aria-live="polite">
        {shown.map((line, i) => (
          <div key={i} className={`kc-b${line.role === "user" ? " me" : ""}`}>
            <Rich text={line.text} />
            {line.actions.length > 0 && (
              <div className="kc-actions">
                {line.actions.map((a) => (
                  <a key={a.path} className="btn pri" href={a.path}>
                    {a.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="kc-b kc-typing">mengetik…</div>}
      </div>

      <form
        className="kc-inp"
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
        <button className="btn pri" type="submit" disabled={busy || !draft.trim()}>
          Kirim
        </button>
      </form>
    </section>
    </div>
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
