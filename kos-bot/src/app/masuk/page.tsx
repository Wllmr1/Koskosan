import { currentRenter } from "@/lib/renter-auth";
import FlowShell from "@/components/site/FlowShell";

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
    <FlowShell narrow>
      <div className="lbl">Penghuni</div>
      <h1>Masuk penghuni</h1>
      {renter ? (
        <>
          <p>Kakak sudah masuk sebagai {renter.fullName}.</p>
          <div className="actions">
            <a className="btn pri" href="/akun" style={{ width: "auto" }}>Akun saya</a>
            <form method="post" action="/api/auth/logout">
              <button className="btn" type="submit" style={{ width: "auto" }}>Keluar</button>
            </form>
          </div>
        </>
      ) : (
        <form method="post" action="/api/auth/login">
          <p className="small" style={{ margin: "0 0 18px" }}>
            Pakai nomor HP dan password yang kakak buat waktu tanda tangan kontrak.
          </p>
          {notice && <p className={`notice ${notice.bad ? "bad" : "ok"}`} role="alert">{notice.text}</p>}
          <label className="lbl" htmlFor="phone">Nomor HP</label>
          <input id="phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="0812…" required />
          <label className="lbl" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button className="btn pri" type="submit">Masuk</button>
          <p className="small" style={{ marginTop: 18 }}>
            Lupa password? Minta link atur ulang ke pemilik kos.
          </p>
        </form>
      )}
    </FlowShell>
  );
}
