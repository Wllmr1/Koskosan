import { LIST_KINDS, type ListKind } from "@/lib/admin-forms";

type Row = { id: string; a: string; b: string };

export default function ListEditor({ kind, rows }: { kind: ListKind; rows: Row[] }) {
  const k = LIST_KINDS[kind];
  const action = `/api/admin/data/list/${kind}`;
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>{k.title}</h2>
      {rows.length === 0 && <p className="muted small">Belum ada isi.</p>}
      {rows.map((row, i) => (
        <div key={row.id} className="admin-row">
          <form method="post" action={action} className="admin-row-form">
            <input type="hidden" name="id" value={row.id} />
            <input name="a" defaultValue={row.a} aria-label={k.a} maxLength={200} required />
            <textarea name="b" defaultValue={row.b} aria-label={k.b} rows={kind === "faq" ? 3 : 1} maxLength={1500} required />
            <button className="btn" name="op" value="update" type="submit">Simpan</button>
          </form>
          <form method="post" action={action} className="admin-row-tools">
            <input type="hidden" name="id" value={row.id} />
            <button className="btn" name="op" value="up" type="submit" disabled={i === 0} aria-label="Naik">↑</button>
            <button className="btn" name="op" value="down" type="submit" disabled={i === rows.length - 1} aria-label="Turun">↓</button>
            <button className="btn" name="op" value="delete" type="submit">Hapus</button>
          </form>
        </div>
      ))}
      <form method="post" action={action} className="admin-row-form" style={{ marginTop: 18 }}>
        <input name="a" placeholder={k.a} maxLength={200} required />
        <textarea name="b" placeholder={k.b} rows={kind === "faq" ? 3 : 1} maxLength={1500} required />
        <button className="btn btn-pri" name="op" value="create" type="submit">Tambah</button>
      </form>
    </div>
  );
}
