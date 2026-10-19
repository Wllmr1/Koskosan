import type { Room } from "@prisma/client";
import { RoomStatus } from "@prisma/client";
import { Area, Num, Text } from "./Fields";

const STATUS: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};

/** The same fields for "add room" and "edit room". */
export default function RoomFields({ room }: { room?: Room }) {
  return (
    <div className="admin-grid">
      <Text name="code" label="Kode kamar" value={room?.code} max={12} hint="Contoh: B-204" />
      <Text name="type" label="Tipe" value={room?.type} max={40} hint="Standard / Deluxe / Studio" />
      <Num name="floor" label="Lantai" value={room?.floor ?? 1} min={0} max={50} />
      <Text name="sizeLabel" label="Ukuran" value={room?.sizeLabel} max={40} hint="Contoh: 3 × 4 m" />
      <Num name="monthlyPrice" label="Harga per bulan (Rp)" value={room?.monthlyPrice ?? 1_000_000} min={100_000} step={10_000} />
      <Text name="bathroom" label="Kamar mandi" value={room?.bathroom} max={80} />
      <Text name="extras" label="Isi kamar" value={room?.extras} max={300} hint="AC, kasur, lemari, …" />
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
      <Area name="description" label="Deskripsi" value={room?.description} hint="Tampil di halaman kamar." />
      <label className="admin-check admin-wide">
        <input type="checkbox" name="hidden" defaultChecked={room?.hidden ?? false} /> Sembunyikan dari situs dan asisten
      </label>
    </div>
  );
}
