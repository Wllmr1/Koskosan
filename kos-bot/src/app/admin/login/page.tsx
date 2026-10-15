export const metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <form
        className="card"
        method="post"
        action="/api/admin/login"
        style={{ padding: "32px 28px", width: "min(380px,100%)" }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Dashboard pemilik</h1>
        <p className="muted small" style={{ margin: "0 0 20px" }}>Masuk untuk melihat kontrak, tagihan, dan keluhan.</p>
        {error && (
          <p style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 12 }}>Password salah.</p>
        )}
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn btn-pri" type="submit" style={{ width: "100%", marginTop: 16 }}>
          Masuk
        </button>
      </form>
    </main>
  );
}
