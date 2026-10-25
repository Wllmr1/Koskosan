"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  token: string;
  propertyName: string;
  reference: string;
  moveIn: { min: string; value?: string };
  room: { type: string; size: string; price: string };
  contract: string;
  startStep: number;
  summary: { rentLabel: string; rentAmount: string; depositAmount: string; total: string };
  clauses: { heading: string; body: string }[];
  contractHash: string;
};

const STEPS = ["Data diri", "Kontrak", "Tanda tangan", "Pembayaran"];

export default function ApplyFlow(props: Props) {
  const [step, setStep] = useState(props.startStep);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const password = String(data.get("password") ?? "");
    const passwordConfirm = String(data.get("passwordConfirm") ?? "");

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
    if (password.length < 10) { fail("password", "Password minimal 10 karakter."); ok = false; }
    else if (password !== passwordConfirm) { fail("passwordConfirm", "Kedua password tidak sama."); ok = false; }
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/apply", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim data.");
      // Reload so the server renders the contract with the details just saved —
      // the text on screen must be the exact text that gets signed.
      window.location.reload();
      return;
    } catch (error) {
      fail("form", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ── step 3: signature pad ───────────────────────────────────────── */
  useEffect(() => {
    if (step !== 3) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 170 * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16192a";

    let drawing = false;
    const point = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      setHasSignature(true);
      clearError("signature");
      ctx.beginPath();
      ctx.moveTo(...point(e));
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      ctx.lineTo(...point(e));
      ctx.stroke();
      e.preventDefault();
    };
    const up = () => { drawing = false; };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [step]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, []);

  async function submitSignature() {
    if (busy) return;
    if (!hasSignature) { fail("signature", "Tanda tangannya belum ada."); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/apply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: props.token,
          signature: canvas.toDataURL("image/png"),
          agreed: "true",
          shownHash: props.contractHash,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan tanda tangan.");
      setStep(4);
      // Straight to the payment page — the bot never sends a payment URL itself.
      window.location.href = json.paymentUrl;
    } catch (error) {
      fail("signature", (error as Error).message);
      setBusy(false);
    }
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
            Data ini dipakai untuk kontrak sewa dan disimpan terenkripsi. Kami tidak pernah meminta data kakak lewat
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

          <div className="row2">
            <Field
              label="Buat password"
              error={errors.password}
              hint="Minimal 10 karakter. Dipakai untuk masuk sebagai penghuni."
            >
              <input name="password" type="password" autoComplete="new-password" minLength={10} onInput={() => clearError("password")} required />
            </Field>
            <Field label="Ulangi password" error={errors.passwordConfirm}>
              <input name="passwordConfirm" type="password" autoComplete="new-password" minLength={10} onInput={() => clearError("passwordConfirm")} required />
            </Field>
          </div>

          <Field label="Tanggal mulai masuk" error={errors.moveInDate}>
            <input name="moveInDate" type="date" min={props.moveIn.min} defaultValue={props.moveIn.value ?? props.moveIn.min} required />
          </Field>

          <div className="actions">
            <button className="btn pri" type="submit" disabled={busy}>
              {busy ? "Menyimpan…" : "Lanjut ke kontrak"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <>
          <div className="contract">
            <h3>Perjanjian Sewa Kamar Kos</h3>
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
            <span>Saya sudah membaca dan menyetujui seluruh isi kontrak di atas.</span>
          </label>
          {errors.agreed && <ErrorText>{errors.agreed}</ErrorText>}

          <div className="actions">
            <button
              className="btn pri"
              type="button"
              onClick={() => (agreed ? setStep(3) : fail("agreed", "Centang persetujuan dulu ya."))}
            >
              Lanjut tanda tangan
            </button>
            <button className="btn" type="button" onClick={() => setStep(1)}>Kembali</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
            Tanda tangan di kotak ini pakai jari atau mouse. Tanda tangan, waktu, dan alamat IP dicatat sebagai bukti
            persetujuan.
          </p>
          <canvas ref={canvasRef} className="sig" aria-label="Kotak tanda tangan" />
          {errors.signature && <ErrorText>{errors.signature}</ErrorText>}

          <div className="paybox">
            <Row label={props.summary.rentLabel} value={props.summary.rentAmount} />
            <Row label="Deposit (dikembalikan)" value={props.summary.depositAmount} />
            <Row label="Total pembayaran pertama" value={props.summary.total} total />
          </div>

          <div className="actions">
            <button className="btn pri" type="button" onClick={submitSignature} disabled={busy}>
              {busy ? "Memproses…" : `Tanda tangani & bayar ${props.summary.total}`}
            </button>
            <button className="btn" type="button" onClick={clearSignature}>Ulangi</button>
            <button className="btn" type="button" onClick={() => setStep(2)}>Kembali</button>
          </div>
        </>
      )}

      {step === 4 && (
        <p className="notice" style={{ textAlign: "center" }}>Mengarahkan ke halaman pembayaran…</p>
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
