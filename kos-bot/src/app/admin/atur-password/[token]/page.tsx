import { SETUP_INVALID, findAdminSetup } from "@/lib/admin-auth";
import { PASSWORD_MIN } from "@/lib/password";

export const dynamic = "force-dynamic";
// The address is the one-time link itself: never send it on to another site.
export const metadata = { title: "Atur password admin", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/** Public: a helper opens the link the owner sent them and chooses a password. */
export default async function AdminSetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await findAdminSetup(token);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      {!row ? (
        <section className="card" style={{ padding: "32px 28px", width: "min(380px,100%)" }}>
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>Link tidak berlaku</h1>
          <p className="muted small" style={{ margin: 0 }}>{SETUP_INVALID}</p>
        </section>
      ) : (
        <form className="card" method="post" action="/api/admin/atur-password" style={{ padding: "32px 28px", width: "min(380px,100%)" }}>
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>Atur password admin</h1>
          <p className="muted small" style={{ margin: "0 0 20px" }}>
            Untuk {row.admin.name} ({row.admin.email}). Minimal {PASSWORD_MIN} karakter.
          </p>
          <input type="hidden" name="token" value={token} />
          <label htmlFor="password">Password baru</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          <label htmlFor="passwordConfirm" style={{ marginTop: 12 }}>Ulangi password</label>
          <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          <button className="btn btn-pri" type="submit" style={{ width: "100%", marginTop: 16 }}>Simpan</button>
        </form>
      )}
    </main>
  );
}
