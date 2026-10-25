import type { Room, RoomType } from "@prisma/client";
import { RoomStatus } from "@prisma/client";
import { Num, Text } from "./Fields";

const STATUS: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};

/** The same fields for "add room" and "edit room". */
export default function RoomFields({ room, types }: { room?: Room; types: Pick<RoomType, "id" | "name">[] }) {
  return (
    <div className="admin-grid">
      <Text name="code" label="Kode kamar" value={room?.code} max={12} hint="Contoh: B-204" />
      <div className="admin-field">
        <label htmlFor="roomTypeId">Tipe kamar</label>
        <select id="roomTypeId" name="roomTypeId" defaultValue={room?.roomTypeId ?? ""} required>
          <option value="" disabled>Pilih tipe</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <small>Harga, ukuran, dan foto diatur di <a href="/admin/data/tipe">Tipe kamar</a>.</small>
      </div>
      <Num name="floor" label="Lantai" value={room?.floor ?? 1} min={0} max={50} />
      <div className="admin-field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={room?.status ?? RoomStatus.AVAILABLE}>
          {Object.values(RoomStatus).map((s) => (
            <option key={s} value={s}>{STATUS[s]}</option>
          ))}
        </select>
      </div>
      <div className="admin-field">
        <label htmlFor="availableOn">Kosong mulai</label>
        <input id="availableOn" name="availableOn" type="date" defaultValue={room?.availableOn?.toISOString().slice(0, 10) ?? ""} />
        <small>Hanya untuk kamar yang belum tersedia.</small>
      </div>
      <Num name="sortOrder" label="Urutan tampil" value={room?.sortOrder ?? 0} min={0} max={999} />
      <label className="admin-check admin-wide">
        <input type="checkbox" name="hidden" defaultChecked={room?.hidden ?? false} /> Sembunyikan dari situs dan asisten
      </label>
    </div>
  );
}
