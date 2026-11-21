import { requireAdmin } from "@/lib/auth";
import { niceDate, rp } from "@/lib/money";
import { filterBills, KIND_FILTERS, loadBills, STATE_FILTERS, type AdminBill } from "@/lib/admin-bills";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { text: string; tone: "ok" | "bad" }> = {
  accepted: { text: "Pembayaran diterima. Penyewa sudah dikabari.", tone: "ok" },
  rejected: { text: "Bukti ditolak. Penyewa sudah dikabari alasannya dan bisa mengirim ulang.", tone: "ok" },
  already: { text: "Bukti ini sudah diproses sebelumnya.", tone: "bad" },
};

function href(state?: string, kind?: string) {
  const p = new URLSearchParams();
  if (state) p.set("status", state);
  if (kind) p.set("jenis", kind);
  const q = p.toString();
  return q ? `/admin/tagihan?${q}` : "/admin/tagihan";
}

function StatusCell({ b }: { b: AdminBill }) {
  if (b.state === "pending") return <span className="st pend">Bukti dikirim {niceDate(b.pendingProof!.uploadedAt)}</span>;
  if (b.state === "late") return <span className="st bad">Terlambat {b.daysLate} hari</span>;
  if (b.state === "paid") return <span className="st ok">Lunas{b.paidAt ? ` · ${niceDate(b.paidAt)}` : ""}</span>;
  if (b.state === "rejected") return <span className="st bad">Bukti ditolak</span>;
  if (b.state === "closed") return <span className="st mute">Tidak berlaku</span>;
  return <span className="st warn">Jatuh tempo {niceDate(b.dueDate)}</span>;
}

/** Every bill, filterable by where it stands and by type (deposit / rent / electricity). */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ status?: string; jenis?: string; ok?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const all = await loadBills();
  const state = q.status && q.status in STATE_FILTERS ? q.status : undefined;
  const kind = q.jenis && q.jenis in KIND_FILTERS ? q.jenis : undefined;
  const shown = filterBills(all, state, kind);
  const owed = shown.filter((b) => b.state !== "paid" && b.state !== "closed").reduce((s, b) => s + b.remaining, 0);
  const notice = q.ok ? NOTICE[q.ok] : undefined;

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      {notice && <p className={notice.tone === "ok" ? "note" : "note bad"}>{notice.text}</p>}
      <div className="chips">
        <a className={!state ? "chip on" : "chip"} href={href(undefined, kind)}>Semua</a>
        {Object.entries(STATE_FILTERS).map(([key, f]) => (
          <a key={key} className={state === key ? "chip on" : "chip"} href={href(key, kind)}>
            {f.label} {filterBills(all, key, kind).length}
          </a>
        ))}
        <span className="gap" />
        <a className={!kind ? "chip on" : "chip"} href={href(state, undefined)}>Semua jenis</a>
        {Object.entries(KIND_FILTERS).map(([key, f]) => (
          <a key={key} className={kind === key ? "chip on" : "chip"} href={href(state, key)}>{f.label}</a>
        ))}
      </div>

      <div className="panel">
        <div className="h">
          <b>{state ? STATE_FILTERS[state as keyof typeof STATE_FILTERS].label : "Semua tagihan"}</b>
          <span>{shown.length} tagihan{owed ? ` · ${rp(owed)} belum dibayar` : ""}</span>
        </div>
        <div className="in">
          {shown.length === 0 ? (
            <p className="empty">Tidak ada tagihan di sini.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Tagihan</th><th>Jenis</th><th>Penyewa</th><th>Jumlah</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id}>
                    <td>{b.code}<small>{b.description}</small></td>
                    <td><span className="kind">{b.kindLabel}</span></td>
                    <td>{b.payer}<small>{b.prospect ? `calon penghuni · ${b.where}` : b.where}</small></td>
                    <td>{rp(b.state === "paid" ? b.amount : b.remaining)}</td>
                    <td><StatusCell b={b} /></td>
                    <td>
                      <a className={b.state === "pending" ? "btn pri" : "btn"} href={`/admin/tagihan/${b.code}`}>
                        {b.state === "pending" ? "Cek bukti" : "Detail"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
