import type { RoomType } from "@prisma/client";
import { Area, Num, Text } from "./Fields";

/** The same fields for "add type" and "edit type". */
export default function RoomTypeFields({ type }: { type?: RoomType }) {
  return (
    <div className="admin-grid">
      <Text name="name" label="Nama tipe" value={type?.name} max={40} hint="Contoh: Deluxe VIP" />
      <Text name="slug" label="Alamat di situs" value={type?.slug} max={40} hint="Huruf kecil, angka, dan tanda -. Contoh: deluxe-vip" />
      <Text name="sizeLabel" label="Ukuran" value={type?.sizeLabel} max={40} hint="Contoh: 3 × 4 m" />
      <Num name="monthlyPrice" label="Harga per bulan (Rp)" value={type?.monthlyPrice ?? 1_000_000} min={100_000} step={10_000} />
      <Text name="bathroom" label="Kamar mandi" value={type?.bathroom} max={80} />
      <Text name="extras" label="Isi kamar" value={type?.extras} max={300} hint="AC, kasur, lemari, …" />
      <Num name="sortOrder" label="Urutan tampil" value={type?.sortOrder ?? 0} min={0} max={999} />
      <Area name="description" label="Deskripsi" value={type?.description} hint="Tampil di halaman tipe." />
      <label className="admin-check">
        <input type="checkbox" name="isNew" defaultChecked={type?.isNew ?? false} /> Kos baru
      </label>
      <label className="admin-check">
        <input type="checkbox" name="isVip" defaultChecked={type?.isVip ?? false} /> VIP
      </label>
      <label className="admin-check">
        <input type="checkbox" name="hasEnsuite" defaultChecked={type?.hasEnsuite ?? false} /> Kamar mandi dalam
      </label>
    </div>
  );
}
