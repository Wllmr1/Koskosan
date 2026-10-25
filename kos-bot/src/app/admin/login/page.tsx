import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk dashboard", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  "1": "Email atau password salah.",
  limit: "Terlalu banyak percobaan. Coba lagi nanti.",
};

/** Public: the owner (email + password from the environment) and their helpers log in here. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; ready?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error, ready } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS["1"]) : null;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <form
        className="card"
        method="post"
        action="/api/admin/login"
        style={{ padding: "32px 28px", width: "min(380px,100%)" }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Dashboard kos</h1>
        <p className="muted small" style={{ margin: "0 0 20px" }}>Masuk untuk melihat kontrak, tagihan, dan keluhan.</p>
        {ready && !message && (
          <p role="status" style={{ color: "var(--ok)", fontSize: 13.5, marginBottom: 12 }}>Password tersimpan. Silakan masuk.</p>
        )}
        {message && (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 12 }}>{message}</p>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn btn-pri" type="submit" style={{ width: "100%", marginTop: 16 }}>
          Masuk
        </button>
      </form>
    </main>
  );
}
