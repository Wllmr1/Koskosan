"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  token: string;
  propertyName: string;
  reference: string;
  room: { code: string; type: string; size: string; price: string };
  plan: string;
  startStep: number;
  summary: { rentLabel: string; rentAmount: string; depositAmount: string; total: string };
  clauses: { heading: string; body: string }[];
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
        body: JSON.stringify({ token: props.token, signature: canvas.toDataURL("image/png"), agreed: "true" }),
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
    <div className="card" style={{ overflow: "hidden" }}>
      <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <strong style={{ fontFamily: "var(--display)", fontSize: 16, display: "block" }}>{props.propertyName}</strong>
          <span className="small muted">
            Kamar {props.room.code} · {props.plan} · {props.reference}
          </span>
        </div>
        <span className="pill pill-ok" style={{ marginLeft: "auto" }}>🔒 Halaman aman</span>
      </header>

      <div style={{ display: "flex", gap: 6, padding: "14px 20px 0" }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 2, background: i < step ? "var(--brand)" : "var(--line)" }} />
            <span className="small muted" style={{ fontSize: 11.5, display: "block", marginTop: 5 }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {errors.form && <Alert>{errors.form}</Alert>}

        {step === 1 && (
          <form onSubmit={submitDetails} noValidate>
            <Note>
              Data ini dipakai untuk kontrak sewa dan disimpan terenkripsi. Kami tidak pernah meminta data kakak lewat
              chat.
            </Note>

            <Field label="Nama lengkap sesuai KTP" error={errors.fullName}>
              <input name="fullName" autoComplete="name" onInput={() => clearError("fullName")} required />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <input name="moveInDate" type="date" min={today} defaultValue={today} required />
            </Field>

            <button className="btn btn-pri" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
              {busy ? "Menyimpan…" : "Lanjut ke kontrak"}
            </button>
          </form>
        )}

        {step === 2 && (
          <>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "16px 18px",
                maxHeight: 340,
                overflowY: "auto",
                background: "var(--wash)",
              }}
            >
              <h2 style={{ fontSize: 16, marginBottom: 2 }}>Perjanjian Sewa Kamar Kos</h2>
              <p className="small muted" style={{ margin: "0 0 14px" }}>Referensi {props.reference}</p>
              {props.clauses.map((clause) => (
                <div key={clause.heading} style={{ marginBottom: 12 }}>
                  <strong style={{ fontSize: 14 }}>{clause.heading}</strong>
                  <p className="muted" style={{ margin: "3px 0 0", fontSize: 13.5, whiteSpace: "pre-line" }}>
                    {clause.body}
                  </p>
                </div>
              ))}
            </div>

            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "16px 0 4px", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => { setAgreed(e.target.checked); clearError("agreed"); }}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span style={{ fontSize: 14.5 }}>Saya sudah membaca dan menyetujui seluruh isi kontrak di atas.</span>
            </label>
            {errors.agreed && <ErrorText>{errors.agreed}</ErrorText>}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="button" onClick={() => setStep(1)}>Kembali</button>
              <button
                className="btn btn-pri"
                type="button"
                style={{ flex: 1 }}
                onClick={() => (agreed ? setStep(3) : fail("agreed", "Centang persetujuan dulu ya."))}
              >
                Lanjut tanda tangan
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              Tanda tangan di kotak ini pakai jari atau mouse. Tanda tangan, waktu, dan alamat IP dicatat sebagai bukti
              persetujuan.
            </p>
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: 170,
                border: "1px dashed var(--line)",
                borderRadius: 12,
                background: "#fff",
                touchAction: "none",
                display: "block",
              }}
            />
            {errors.signature && <ErrorText>{errors.signature}</ErrorText>}

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={clearSignature}>Ulangi</button>
              <button className="btn" type="button" onClick={() => setStep(2)}>Kembali</button>
              <button className="btn btn-pri" type="button" style={{ flex: 1 }} onClick={submitSignature} disabled={busy}>
                {busy ? "Memproses…" : `Tanda tangani & bayar ${props.summary.total}`}
              </button>
            </div>

            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginTop: 16 }}>
              <Row label={props.summary.rentLabel} value={props.summary.rentAmount} />
              <Row label="Deposit (dikembalikan)" value={props.summary.depositAmount} />
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
                <Row label="Total pembayaran pertama" value={props.summary.total} strong />
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p className="muted">Mengarahkan ke halaman pembayaran…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label>{label}</label>
      {children}
      {hint && !error && <p className="small muted" style={{ margin: "4px 0 0", fontSize: 12.5 }}>{hint}</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--bad)", fontSize: 12.5, margin: "4px 0 0" }}>{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--gold-soft)", color: "var(--gold)", borderRadius: 12, padding: "10px 13px", fontSize: 13, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bad-soft)", color: "var(--bad)", borderRadius: 12, padding: "10px 13px", fontSize: 13.5, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: strong ? 16 : 14 }}>
      <span className={strong ? undefined : "muted"}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
