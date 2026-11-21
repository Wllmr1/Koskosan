import { redirect } from "next/navigation";
import { LeaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { rp } from "@/lib/money";
import Notice from "@/components/admin/Notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tambah penghuni", robots: { index: false, follow: false } };

/** For renters who signed on paper before this system existed. */
export default async function AddTenantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const rooms = await prisma.room.findMany({
    where: { leases: { none: { status: LeaseStatus.ACTIVE } } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { roomType: true },
  });

  return (
    <main className="wrap" style={{ padding: "26px 20px 60px", maxWidth: 820 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>Tambah penghuni lama</h1>
        <a className="btn" href="/admin" style={{ marginLeft: "auto" }}>← Dashboard</a>
      </header>
      <p className="muted small" style={{ marginTop: 0 }}>
        Untuk penghuni yang sudah tanda tangan kontrak kertas sebelum ada sistem ini. Setelah disimpan, kakak mendapat link
        atur password untuk dikirim ke penghuni, supaya mereka bisa masuk ke akun.
      </p>
      <Notice error={error} />
      {rooms.length === 0 ? (
        <p className="panel">Semua kamar sudah punya penghuni aktif.</p>
      ) : (
        <form method="post" action="/api/admin/penghuni" encType="multipart/form-data" className="panel" target="_self">
          <h2 className="panel-title" style={{ fontSize: 20, marginBottom: 12 }}>Data penghuni</h2>
          <div className="admin-grid">
            <div className="admin-field admin-wide"><label htmlFor="fullName">Nama lengkap sesuai KTP</label><input id="fullName" name="fullName" required maxLength={80} /></div>
            <div className="admin-field"><label htmlFor="phone">Nomor HP (WhatsApp)</label><input id="phone" name="phone" inputMode="tel" required placeholder="0812…" /></div>
            <div className="admin-field"><label htmlFor="dateOfBirth">Tanggal lahir</label><input id="dateOfBirth" name="dateOfBirth" type="date" required /></div>
            <div className="admin-field"><label htmlFor="idNumber">Nomor KTP (16 digit)</label><input id="idNumber" name="idNumber" inputMode="numeric" required /><small>Disimpan terenkripsi.</small></div>
            <div className="admin-field"><label htmlFor="ktp">Foto KTP (opsional)</label><input id="ktp" name="ktp" type="file" accept="image/jpeg,image/png,image/webp" /></div>
          </div>

          <h2 className="panel-title" style={{ fontSize: 20, margin: "24px 0 12px" }}>Kontrak</h2>
          <div className="admin-grid">
            <div className="admin-field">
              <label htmlFor="roomId">Kamar</label>
              <select id="roomId" name="roomId" required>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.code} · {r.roomType.name} · {rp(r.roomType.monthlyPrice)}</option>
                ))}
              </select>
              <small>Hanya kamar tanpa penghuni aktif.</small>
            </div>
            <div className="admin-field">
              <label htmlFor="plan">Cara bayar</label>
              <select id="plan" name="plan" defaultValue="MONTHLY">
                <option value="MONTHLY">Bulanan</option>
                <option value="YEARLY">Tahunan</option>
              </select>
            </div>
            <div className="admin-field"><label htmlFor="monthlyRent">Sewa per bulan sesuai kontrak (Rp)</label><input id="monthlyRent" name="monthlyRent" type="number" min={100000} step={10000} required /></div>
            <div className="admin-field"><label htmlFor="deposit">Deposit yang sudah dibayar (Rp)</label><input id="deposit" name="deposit" type="number" min={0} step={10000} required defaultValue={0} /></div>
            <div className="admin-field"><label htmlFor="startDate">Mulai kontrak</label><input id="startDate" name="startDate" type="date" required /></div>
            <div className="admin-field"><label htmlFor="endDate">Selesai kontrak</label><input id="endDate" name="endDate" type="date" required /></div>
            <div className="admin-field admin-wide"><label htmlFor="contract">Scan kontrak kertas (PDF, opsional)</label><input id="contract" name="contract" type="file" accept="application/pdf" /><small>Penghuni bisa mengunduhnya dari halaman akun mereka. Maksimal 10 MB.</small></div>
          </div>
          <button className="btn btn-pri" type="submit" style={{ marginTop: 20 }}>Simpan dan buat link atur password</button>
        </form>
      )}
    </main>
  );
}
