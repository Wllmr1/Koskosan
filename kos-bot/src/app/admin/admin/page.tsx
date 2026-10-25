import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { ADMIN_ERRORS } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelola admin", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  ...ADMIN_ERRORS,
  notfound: "Admin tidak ditemukan.",
  disabled: "Aktifkan admin ini dulu, baru buat link baru.",
  op: "Aksi tidak dikenal.",
};

const when = (d: Date | null) =>
  d ? d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "Belum pernah";

/**
 * Owner only: helpers who may use the dashboard. A new helper gets a one-time
 * link to choose their own password; switching one off logs them out at once.
 */
export default async function ManageAdminsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireOwner();
  const q = await searchParams;
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  const error = q.error ? (ERRORS[q.error] ?? ERRORS.op) : null;

  return (
    <main className="wrap" style={{ padding: "26px 20px 60px", maxWidth: 900 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>Kelola admin</h1>
        <a className="btn" href="/admin" style={{ marginLeft: "auto" }}>← Dashboard</a>
      </header>
      <p className="muted small" style={{ marginTop: 0 }}>
        Admin bisa memakai dashboard seperti kakak, kecuali halaman ini. Setiap perubahan tercatat atas nama mereka.
      </p>
      {(q.saved || error) && (
        <p
          className="small"
          role={error ? "alert" : "status"}
          style={{ padding: "9px 13px", borderRadius: 10, margin: "0 0 14px", background: error ? "var(--bad-soft)" : "var(--ok-soft)", color: error ? "var(--bad)" : "var(--ok)" }}
        >
          {error ?? "Tersimpan."}
        </p>
      )}

      <section className="card" style={{ padding: 22, marginBottom: 18, overflowX: "auto" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Admin</h2>
        {admins.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Belum ada admin. Hanya kakak yang bisa masuk.</p>
        ) : (
          <table>
            <thead><tr><th>Nama</th><th>Email</th><th>Status</th><th>Terakhir masuk</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.email}</td>
                  <td>{a.disabled ? "Nonaktif" : a.passwordHash ? "Aktif" : "Belum atur password"}</td>
                  <td>{when(a.lastLoginAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <form method="post" action="/api/admin/admins">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="op" value={a.disabled ? "enable" : "disable"} />
                        <button className="btn" type="submit" style={{ padding: "6px 10px", fontSize: 13 }}>
                          {a.disabled ? "Aktifkan" : "Nonaktifkan"}
                        </button>
                      </form>
                      {!a.disabled && (
                        <form method="post" action="/api/admin/admins">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="op" value="link" />
                          <button className="btn" type="submit" style={{ padding: "6px 10px", fontSize: 13 }}>Buat link baru</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <form method="post" action="/api/admin/admins" className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tambah admin</h2>
        <input type="hidden" name="op" value="create" />
        <label htmlFor="name">Nama</label>
        <input id="name" name="name" required minLength={2} maxLength={80} autoComplete="off" />
        <label htmlFor="email" style={{ marginTop: 12 }}>Email</label>
        <input id="email" name="email" type="email" required autoComplete="off" />
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          Setelah ditambah, kakak mendapat link sekali pakai untuk dikirim lewat WhatsApp. Admin membuat password sendiri dari link itu.
        </p>
        <button className="btn btn-pri" type="submit" style={{ marginTop: 16 }}>Tambah admin</button>
      </form>
    </main>
  );
}
