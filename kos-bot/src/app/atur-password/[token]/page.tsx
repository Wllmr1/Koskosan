import { findSetupToken } from "@/lib/password-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atur password", robots: { index: false, follow: false } };

export default async function SetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const row = await findSetupToken(token);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ padding: "32px 28px", width: "min(400px,100%)" }}>
        {!row ? (
          <>
            <h1 style={{ fontSize: 20 }}>Link tidak berlaku</h1>
            <p className="muted">Link sudah dipakai atau kedaluwarsa. Minta link baru ke pemilik kos ya kak.</p>
          </>
        ) : (
          <form method="post" action="/api/auth/set-password">
            <h1 style={{ fontSize: 20, marginBottom: 6 }}>Atur password</h1>
            <p className="muted small" style={{ margin: "0 0 16px" }}>
              Untuk {row.tenant.fullName.split(" ")[0]}. Minimal 10 karakter.
            </p>
            {error && (
              <p className="small" style={{ color: "var(--bad)", background: "var(--bad-soft)", padding: "8px 12px", borderRadius: 10 }}>
                {error.slice(0, 160)}
              </p>
            )}
            <input type="hidden" name="token" value={token} />
            <label htmlFor="password">Password baru</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            <label htmlFor="passwordConfirm" style={{ marginTop: 12 }}>Ulangi password</label>
            <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={10} required />
            <button className="btn btn-pri" type="submit" style={{ width: "100%", marginTop: 16 }}>Simpan</button>
          </form>
        )}
      </div>
    </main>
  );
}
