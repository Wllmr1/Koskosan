import type { Photo, Room } from "@prisma/client";
import { RoomStatus } from "@prisma/client";
import { niceDate, rp } from "@/lib/money";
import { PhotoSlot } from "./PhotoSlot";

const STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Sudah dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};

/** Title block at the top of every inner page. */
export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header style={{ margin: "6px 0 20px" }}>
      <h1 style={{ fontSize: "clamp(26px,4vw,38px)" }}>{title}</h1>
      {sub && <p className="muted" style={{ margin: "8px 0 0", maxWidth: "62ch" }}>{sub}</p>}
    </header>
  );
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 26, marginBottom: 20 }}>
      <h2 style={{ fontSize: 20 }}>{title}</h2>
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

/** A room in a list: cover photo (or placeholder), key facts, availability. Links to the room page. */
export function RoomCard({ room }: { room: Room & { photos: Photo[] } }) {
  return (
    <a href={`/kamar/${encodeURIComponent(room.code)}`} className="room-card">
      <PhotoSlot photo={room.photos[0] ?? null} alt={`Kamar ${room.code}`} />
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, marginTop: 10 }}>
        {room.code} · {room.type}
      </div>
      <div className="small muted">
        {room.sizeLabel} · lantai {room.floor} · {room.bathroom}
      </div>
      <div style={{ fontWeight: 600, marginTop: 6 }}>
        {rp(room.monthlyPrice)} <span className="small muted">/bulan</span>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>{room.extras}</div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={`pill ${room.status === "AVAILABLE" ? "pill-ok" : room.status === "BOOKED" ? "pill-warn" : "pill-mute"}`}>
          {STATUS_LABEL[room.status]}
        </span>
        <span className="small muted">
          {room.status === "AVAILABLE" ? "bisa masuk sekarang" : room.availableOn ? `kosong ${niceDate(room.availableOn)}` : ""}
        </span>
      </div>
    </a>
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
