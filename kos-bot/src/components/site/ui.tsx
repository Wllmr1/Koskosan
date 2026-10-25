/** Title block at the top of every inner page. */
export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {sub && <p className="muted" style={{ margin: "8px 0 0", maxWidth: "62ch" }}>{sub}</p>}
    </header>
  );
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {sub ? <p className="muted small" style={{ margin: "4px 0 18px" }}>{sub}</p> : <div style={{ height: 14 }} />}
      {children}
    </section>
  );
}

export function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="muted small">Belum ada isi.</p>;
  return (
    <ul className="dot-list">
      {items.map((item, i) => (
        <li key={i} className="muted">{item}</li>
      ))}
    </ul>
  );
}

export function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong style={{ fontFamily: "var(--display)", fontSize: 22, display: "block" }}>{value}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}

/** Shown when the database has not been seeded yet. */
export function NoData() {
  return (
    <div className="card" style={{ padding: 30 }}>
      <h1 style={{ fontSize: 22 }}>Belum ada data</h1>
      <p className="muted">Jalankan `npm run db:seed` untuk mengisi data awal.</p>
    </div>
  );
}
