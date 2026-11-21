"use client";

import { useState } from "react";

/**
 * Upload a transfer receipt. Posts the file plus the given hidden fields to
 * `action`; on success reloads (or goes to `doneHref`) so the server shows the
 * new "being verified" state.
 */
export default function ProofUpload({
  action,
  fields,
  label = "Kirim bukti transfer",
  doneHref,
  compact,
}: {
  action: string;
  fields: Record<string, string>;
  label?: string;
  doneHref?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const file = data.get("proof");
    if (!(file instanceof File) || file.size === 0) return setError("Pilih foto atau screenshot bukti transfer dulu.");
    if (file.size > 6 * 1024 * 1024) return setError("Ukuran file maksimal 6 MB.");
    for (const [k, v] of Object.entries(fields)) data.set(k, v);

    setBusy(true);
    try {
      const res = await fetch(action, { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim bukti.");
      if (doneHref) window.location.href = doneHref;
      else window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className={compact ? "proof-form compact" : "proof-form"} onSubmit={submit} noValidate>
      <label className="proof-drop">
        <span>Foto atau screenshot bukti transfer</span>
        <input name="proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={() => setError("")} required />
        <small>JPG, PNG, atau WEBP. Maksimal 6 MB.</small>
      </label>
      {error && <div className="err" role="alert">{error}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Mengirim…" : label}</button>
    </form>
  );
}
