import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
import { meterSheet, monthLabel } from "@/lib/meter";
import { rp } from "@/lib/money";
import Notice from "@/components/admin/Notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catat meteran", robots: { index: false, follow: false } };

function parseMonth(v?: string): Date {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
const ym = (d: Date) => d.toISOString().slice(0, 7);
const shift = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

/** Owner types each room's kWh for the month; rooms over the quota can then be billed in one click. */
export default async function MeterPage({ searchParams }: { searchParams: Promise<{ bulan?: string; saved?: string; error?: string; billed?: string }> }) {
  if (!(await isOwner())) redirect("/admin/login");
  const q = await searchParams;
  const period = parseMonth(q.bulan);
  const rows = await meterSheet(period);
  const toBill = rows.filter((r) => r.overKwh > 0 && !r.billed);

  return (
    <main className="wrap" style={{ padding: "26px 20px 60px", maxWidth: 900 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>Catat meteran listrik</h1>
        <a className="btn" href="/admin" style={{ marginLeft: "auto" }}>← Dashboard</a>
      </header>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0 16px" }}>
        <a className="btn" href={`/admin/meteran?bulan=${ym(shift(period, -1))}`}>← Bulan lalu</a>
        <strong style={{ fontFamily: "var(--display)", fontSize: 22 }}>{monthLabel(period)}</strong>
        <a className="btn" href={`/admin/meteran?bulan=${ym(shift(period, 1))}`}>Bulan depan →</a>
      </div>
      <Notice saved={q.saved} error={q.error} />
      {q.billed && <p className="small" style={{ background: "var(--ok-soft)", color: "var(--ok)", padding: "9px 13px", borderRadius: 10 }}>{q.billed} tagihan kelebihan listrik dibuat dan dikirim ke chat penghuni.</p>}

      {rows.length === 0 ? (
        <p className="panel">Belum ada kamar dengan penghuni aktif.</p>
      ) : (
        <>
          <form method="post" action="/api/admin/meteran" className="panel" style={{ overflowX: "auto" }}>
            <input type="hidden" name="op" value="save" />
            <input type="hidden" name="bulan" value={ym(period)} />
            <p className="small muted" style={{ marginTop: 0 }}>Isi kWh yang terpakai selama bulan ini untuk tiap kamar. Kosongkan kalau belum dicatat.</p>
            <table>
              <thead><tr><th>Kamar</th><th>Penghuni</th><th>Terpakai (kWh)</th><th>Kuota</th><th>Kelebihan</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.roomId}>
                    <td><strong>{r.roomCode}</strong></td>
                    <td>{r.tenantName}</td>
                    <td>
                      <input name={`kwh_${r.roomId}`} type="number" min={0} max={5000} step="0.1" defaultValue={r.usedKwh ?? ""} disabled={r.billed} style={{ maxWidth: 120 }} aria-label={`kWh kamar ${r.roomCode}`} />
                    </td>
                    <td>{r.quotaKwh} kWh</td>
                    <td>{r.overKwh > 0 ? `${r.overKwh} kWh · ${rp(r.extraCharge)}` : "—"}</td>
                    <td>{r.billed && <span className="pill pill-ok">Sudah ditagih</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-pri" type="submit" style={{ marginTop: 16 }}>Simpan meteran</button>
          </form>

          <form method="post" action="/api/admin/meteran" className="panel">
            <input type="hidden" name="op" value="bill" />
            <input type="hidden" name="bulan" value={ym(period)} />
            <h2 className="panel-title" style={{ fontSize: 20 }}>Tagih kelebihan listrik</h2>
            <p className="small muted">
              {toBill.length
                ? `${toBill.length} kamar melebihi kuota dan belum ditagih (total ${rp(toBill.reduce((s, r) => s + r.extraCharge, 0))}). Tagihan jatuh tempo bulan depan dan langsung muncul di akun serta chat penghuni.`
                : "Tidak ada kelebihan yang perlu ditagih untuk bulan ini."}
            </p>
            <button className="btn btn-pri" type="submit" disabled={!toBill.length}>Buat {toBill.length} tagihan</button>
          </form>
        </>
      )}
    </main>
  );
}
