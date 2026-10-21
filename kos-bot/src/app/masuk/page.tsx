import { currentRenter } from "@/lib/renter-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk penghuni", robots: { index: false, follow: false } };

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  error: { text: "Nomor HP atau password salah.", bad: true },
  locked: { text: "Terlalu banyak percobaan. Coba lagi 15 menit lagi ya kak.", bad: true },
  set: { text: "Password tersimpan. Silakan masuk." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; locked?: string; set?: string }>;
}) {
  const q = await searchParams;
  const renter = await currentRenter();
  const key = q.locked ? "locked" : q.error ? "error" : q.set ? "set" : null;
  const notice = key ? NOTICES[key] : null;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ padding: "32px 28px", width: "min(400px,100%)" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Masuk penghuni</h1>
        {renter ? (
          <>
            <p className="muted">Kakak sudah masuk sebagai {renter.fullName}.</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a className="btn btn-pri" href="/akun">Akun saya</a>
              <form method="post" action="/api/auth/logout">
                <button className="btn" type="submit">Keluar</button>
              </form>
            </div>
          </>
        ) : (
          <form method="post" action="/api/auth/login">
            <p className="muted small" style={{ margin: "0 0 18px" }}>
              Pakai nomor HP dan password yang kakak buat waktu tanda tangan kontrak.
            </p>
            {notice && (
              <p
                className="small"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: notice.bad ? "var(--bad-soft)" : "var(--ok-soft)",
                  color: notice.bad ? "var(--bad)" : "var(--ok)",
                }}
              >
                {notice.text}
              </p>
            )}
            <label htmlFor="phone">Nomor HP</label>
            <input id="phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="0812…" required />
            <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
            <button className="btn btn-pri" type="submit" style={{ width: "100%", marginTop: 16 }}>
              Masuk
            </button>
            <p className="muted small" style={{ marginTop: 14 }}>
              Lupa password? Minta link atur ulang ke pemilik kos.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
