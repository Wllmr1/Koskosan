import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data kos", robots: { index: false, follow: false } };

const LINKS = [
  ["/admin/data", "Properti"],
  ["/admin/data/tipe", "Tipe kamar"],
  ["/admin/data/kamar", "Kamar"],
  ["/admin/data/foto", "Foto"],
  ["/admin/data/layanan", "Layanan"],
  ["/admin/data/sekitar", "Sekitar"],
  ["/admin/data/faq", "FAQ"],
] as const;

export default async function DataLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <main className="wrap" style={{ padding: "26px 20px 60px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24 }}>Data kos</h1>
        <a className="btn" href="/admin" style={{ marginLeft: "auto" }}>← Dashboard</a>
        <a className="btn" href="/" target="_blank" rel="noreferrer">Lihat situs</a>
      </header>
      <p className="muted small" style={{ marginTop: 0 }}>
        Situs dan asisten hanya memakai data di sini. Yang tidak ada di sini tidak akan diucapkan asisten.
      </p>
      <nav className="admin-nav">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      {children}
    </main>
  );
}
