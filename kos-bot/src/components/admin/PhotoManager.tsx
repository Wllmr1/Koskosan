import type { Photo } from "@prisma/client";
import { photoUrl } from "@/lib/photos";

/** Upload, caption, reorder, choose cover, delete. Used for a room and for the property gallery. */
export default function PhotoManager({ photos, roomId, back }: { photos: Photo[]; roomId: string | null; back: string }) {
  return (
    <section className="card" style={{ padding: 22, marginBottom: 18 }}>
      <h2 style={{ fontSize: 18, marginBottom: 6 }}>Foto</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        JPG, PNG, atau WEBP, maksimal 8 MB per foto. Lokasi GPS dan data kamera otomatis dihapus.
      </p>

      <form method="post" action="/api/admin/photos" encType="multipart/form-data" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <input type="hidden" name="op" value="upload" />
        <input type="hidden" name="back" value={back} />
        {roomId && <input type="hidden" name="roomId" value={roomId} />}
        <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required style={{ flex: "1 1 220px" }} />
        <input name="caption" placeholder="Keterangan (opsional)" maxLength={140} style={{ flex: "1 1 200px" }} />
        <button className="btn btn-pri" type="submit">Unggah</button>
      </form>

      {photos.length === 0 && <p className="muted small">Belum ada foto.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
        {photos.map((p, i) => (
          <figure key={p.id} style={{ margin: 0, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.key)} alt={p.caption} width={p.width} height={p.height} style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
            <figcaption style={{ padding: 10 }}>
              {p.isCover && <span className="pill pill-ok" style={{ marginBottom: 6 }}>Sampul</span>}
              <form method="post" action="/api/admin/photos" style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="op" value="caption" />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={p.id} />
                <input name="caption" defaultValue={p.caption} placeholder="Keterangan" maxLength={140} />
                <button className="btn" type="submit" style={{ padding: "6px 10px" }}>OK</button>
              </form>
              <form method="post" action="/api/admin/photos" style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={p.id} />
                {!p.isCover && <button className="btn" name="op" value="cover" type="submit" style={{ padding: "6px 10px" }}>Jadikan sampul</button>}
                <button className="btn" name="op" value="up" type="submit" disabled={i === 0} style={{ padding: "6px 10px" }} aria-label="Geser kiri">←</button>
                <button className="btn" name="op" value="down" type="submit" disabled={i === photos.length - 1} style={{ padding: "6px 10px" }} aria-label="Geser kanan">→</button>
                <button className="btn" name="op" value="delete" type="submit" style={{ padding: "6px 10px" }}>Hapus</button>
              </form>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
