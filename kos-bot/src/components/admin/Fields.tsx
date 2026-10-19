type Base = { name: string; label: string; hint?: string };

export function Text({ name, label, hint, value, max }: Base & { value?: string | null; max?: number }) {
  return (
    <div className="admin-field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ""} maxLength={max} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Num({ name, label, hint, value, min, max, step }: Base & { value: number; min?: number; max?: number; step?: number }) {
  return (
    <div className="admin-field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" defaultValue={value} min={min} max={max} step={step ?? 1} required />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Area({ name, label, hint, value, rows = 4 }: Base & { value?: string; rows?: number }) {
  return (
    <div className="admin-field admin-wide">
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} defaultValue={value ?? ""} rows={rows} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** A list edited as one item per line. */
export function Lines({ name, label, value }: Base & { value: string[] }) {
  return <Area name={name} label={label} value={value.join("\n")} rows={Math.max(4, value.length + 1)} hint="Satu baris = satu poin." />;
}
