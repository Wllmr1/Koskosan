"use client";

import { useState } from "react";
import ProofUpload from "@/components/site/ProofUpload";

type Props = {
  token: string;
  propertyName: string;
  reference: string;
  moveIn: { min: string; value?: string };
  room: { type: string; size: string; price: string };
  contract: string;
  /** 1 details · 2 terms · 3 pay deposit · 4 upload proof · 5 being verified */
  startStep: number;
  deposit: { amount: string; invoice: string; due: string; rejected?: string } | null;
  /** wa.me link with the ready message, or null to open the website chat instead. */
  payLink: string | null;
  payText: string;
  clauses: { heading: string; body: string }[];
  termsHash: string;
};

const STEPS = ["Data diri", "Syarat & ketentuan", "Bayar deposit", "Kirim bukti", "Verifikasi"];

export default function ApplyFlow(props: Props) {
  const [step, setStep] = useState(props.startStep);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);

  const fail = (field: string, message: string) => setErrors((e) => ({ ...e, [field]: message }));
  const clearError = (field: string) => setErrors((e) => ({ ...e, [field]: "" }));

  /* ── step 1: details ─────────────────────────────────────────────── */
  async function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setErrors({});

    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("token", props.token);

    const name = String(data.get("fullName") ?? "").trim();
    const phone = String(data.get("phone") ?? "").replace(/\D/g, "");
    const idNumber = String(data.get("idNumber") ?? "").replace(/\D/g, "");
    const dob = String(data.get("dateOfBirth") ?? "");
    const ktp = data.get("ktp");

    let ok = true;
    if (name.split(/\s+/).filter(Boolean).length < 2) { fail("fullName", "Tulis nama lengkap sesuai KTP."); ok = false; }
    if (phone.length < 9) { fail("phone", "Nomor HP tidak valid."); ok = false; }
    if (!dob) { fail("dateOfBirth", "Isi tanggal lahir."); ok = false; }
    else {
      const age = (Date.now() - new Date(dob).getTime()) / 31_557_600_000;
      if (age < 17) { fail("dateOfBirth", "Penyewa minimal berusia 17 tahun."); ok = false; }
      if (age > 100) { fail("dateOfBirth", "Periksa lagi tanggalnya."); ok = false; }
    }
    if (idNumber.length !== 16) { fail("idNumber", "Nomor KTP harus 16 digit."); ok = false; }
    if (!(ktp instanceof File) || ktp.size === 0) { fail("ktp", "Foto KTP wajib diunggah."); ok = false; }
    else if (ktp.size > 6 * 1024 * 1024) { fail("ktp", "Ukuran file maksimal 6 MB."); ok = false; }
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/apply", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim data.");
      // Reload so the server renders the terms with the details just saved —
      // the text on screen must be the exact text that gets agreed and hashed.
      window.location.reload();
      return;
    } catch (error) {
      fail("form", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ── step 2: terms ───────────────────────────────────────────────── */
  async function acceptTerms() {
    if (busy) return;
    if (!agreed) { fail("agreed", "Centang persetujuan dulu ya."); return; }
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/apply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.token, agreed: true, shownHash: props.termsHash }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan persetujuan.");
      // The deposit invoice now exists: reload so the server shows it.
      window.location.reload();
    } catch (error) {
      fail("agreed", (error as Error).message);
      setBusy(false);
    }
  }

  function openPayChat() {
    window.dispatchEvent(new CustomEvent("kos:open-chat", { detail: { text: props.payText } }));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flow-head">
        <div className="lbl">{props.propertyName} · {props.contract} · {props.reference}</div>
        <h1>Sewa kamar</h1>
        <p>{props.room.type} · {props.room.size} · {props.room.price} per bulan</p>
      </div>

      <div className="stepper" aria-label="Langkah pendaftaran">
        {STEPS.map((label, i) => (
          <div key={label} className={i < step - 1 ? "done" : i === step - 1 ? "on" : undefined} aria-current={i === step - 1 ? "step" : undefined}>
            {label}
          </div>
        ))}
      </div>

      {errors.form && <p className="err" role="alert">{errors.form}</p>}

      {step === 1 && (
        <form className="form" onSubmit={submitDetails} noValidate>
          <p className="notice">
            Data ini dipakai untuk administrasi dan kontrak sewa, disimpan terenkripsi. Kami tidak pernah meminta data kakak lewat
            chat.
          </p>

          <Field label="Nama lengkap sesuai KTP" error={errors.fullName}>
            <input name="fullName" autoComplete="name" onInput={() => clearError("fullName")} required />
          </Field>

          <div className="row2">
            <Field label="Nomor HP aktif" error={errors.phone}>
              <input name="phone" inputMode="tel" placeholder="0812…" autoComplete="tel" onInput={() => clearError("phone")} required />
            </Field>
            <Field label="Tanggal lahir" error={errors.dateOfBirth}>
              <input name="dateOfBirth" type="date" max={today} onInput={() => clearError("dateOfBirth")} required />
            </Field>
          </div>

          <Field label="Nomor KTP (16 digit)" error={errors.idNumber} hint="Disimpan terenkripsi. Yang tampil hanya 4 angka terakhir.">
            <input name="idNumber" inputMode="numeric" maxLength={16} onInput={() => clearError("idNumber")} required />
          </Field>

          <Field label="Foto KTP" error={errors.ktp} hint="JPG, PNG, atau WEBP. Maksimal 6 MB. Hanya pemilik kos yang bisa membukanya.">
            <input name="ktp" type="file" accept="image/jpeg,image/png,image/webp" onChange={() => clearError("ktp")} required />
          </Field>

          <Field label="Tanggal mulai masuk" error={errors.moveInDate}>
            <input name="moveInDate" type="date" min={props.moveIn.min} defaultValue={props.moveIn.value ?? props.moveIn.min} required />
          </Field>

          <div className="actions">
            <button className="btn pri" type="submit" disabled={busy}>
              {busy ? "Menyimpan…" : "Lanjut ke syarat & ketentuan"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <>
          <div className="contract">
            <h3>Syarat &amp; Ketentuan Sewa</h3>
            <p className="ref">Referensi {props.reference}</p>
            {props.clauses.map((clause) => (
              <div key={clause.heading} className="clause">
                <b>{clause.heading}</b>
                <p>{clause.body}</p>
              </div>
            ))}
          </div>

          <label className="agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => { setAgreed(e.target.checked); clearError("agreed"); }}
            />
            <span>Saya sudah membaca dan menyetujui Syarat &amp; Ketentuan di atas.</span>
          </label>
          {errors.agreed && <ErrorText>{errors.agreed}</ErrorText>}

          <div className="actions">
            <button className="btn pri" type="button" onClick={acceptTerms} disabled={busy}>
              {busy ? "Menyimpan…" : "Setuju, lanjut bayar deposit"}
            </button>
            <button className="btn" type="button" onClick={() => setStep(1)}>Kembali</button>
          </div>
        </>
      )}

      {step === 3 && props.deposit && (
        <>
          {props.deposit.rejected && (
            <p className="err" role="alert">Bukti transfer sebelumnya ditolak: {props.deposit.rejected} Silakan kirim ulang.</p>
          )}
          <div className="paybox">
            <Row label="Deposit (dikembalikan saat keluar)" value={props.deposit.amount} total />
          </div>
          <p className="notice">
            Pembayaran lewat transfer bank. Tekan tombol di bawah untuk minta nomor rekening ke asisten kami di WhatsApp —
            pesannya sudah kami siapkan. Bayar paling lambat {props.deposit.due}. Sewa bulan pertama ditagih terpisah
            setelah deposit diverifikasi.
          </p>
          <div className="actions">
            {props.payLink ? (
              <a className="btn pri wa" href={props.payLink} target="_blank" rel="noreferrer">Minta info rekening di WhatsApp</a>
            ) : (
              <button className="btn pri wa" type="button" onClick={openPayChat}>Minta info rekening ke asisten</button>
            )}
            <button className="btn" type="button" onClick={() => setStep(4)}>Saya sudah transfer</button>
          </div>
        </>
      )}

      {step === 4 && props.deposit && (
        <>
          <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
            Unggah foto atau screenshot bukti transfer deposit {props.deposit.amount} ({props.deposit.invoice}). Pemilik kos
            akan mengeceknya secara manual.
          </p>
          <ProofUpload action="/api/apply/proof" fields={{ token: props.token }} />
          <div className="actions">
            <button className="btn" type="button" onClick={() => setStep(3)}>Kembali</button>
          </div>
        </>
      )}

      {step === 5 && (
        <div className="center">
          <div className="done-mark wait">…</div>
          <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", marginBottom: 12 }}>Pembayaran sedang diverifikasi</h2>
          <p>
            Bukti transfer sudah kami terima. Pengecekan memakan waktu <b>1–2 hari kerja</b>. Kakak akan dapat pesan
            WhatsApp begitu pembayaran terverifikasi, berisi link untuk membuat akun penghuni.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="lbl">
        {label}
        {children}
      </label>
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <div className="err" role="alert">{children}</div>;
}

function Row({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={total ? "row total" : "row"}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
