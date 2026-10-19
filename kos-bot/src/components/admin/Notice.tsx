export default function Notice({ saved, error }: { saved?: string; error?: string }) {
  if (!saved && !error) return null;
  const bad = Boolean(error);
  return (
    <p
      className="small"
      style={{
        padding: "9px 13px",
        borderRadius: 10,
        margin: "0 0 14px",
        background: bad ? "var(--bad-soft)" : "var(--ok-soft)",
        color: bad ? "var(--bad)" : "var(--ok)",
      }}
    >
      {bad ? `Belum tersimpan — ${String(error).slice(0, 200)}` : "Tersimpan. Situs dan asisten sudah memakai data baru."}
    </p>
  );
}
