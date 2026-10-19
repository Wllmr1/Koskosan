import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import RoomFields from "@/components/admin/RoomFields";
import PhotoManager from "@/components/admin/PhotoManager";

export default async function EditRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const room = await prisma.room.findUnique({ where: { id }, include: { photos: { orderBy: { sortOrder: "asc" } } } });
  if (!room) notFound();

  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <form method="post" action="/api/admin/data/rooms" className="card" style={{ padding: 22, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Kamar {room.code}</h2>
        <input type="hidden" name="op" value="update" />
        <input type="hidden" name="id" value={room.id} />
        <RoomFields room={room} />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-pri" type="submit">Simpan</button>
          <a className="btn" href={`/kamar/${encodeURIComponent(room.code)}`} target="_blank" rel="noreferrer">Lihat di situs</a>
        </div>
      </form>
      <PhotoManager photos={room.photos} roomId={room.id} back={`/admin/data/kamar/${room.id}`} />
      <form method="post" action="/api/admin/data/rooms" className="card" style={{ padding: 22 }}>
        <input type="hidden" name="op" value="delete" />
        <input type="hidden" name="id" value={room.id} />
        <p className="muted small" style={{ marginTop: 0 }}>
          Kamar yang pernah punya pendaftaran atau kontrak tidak bisa dihapus — sembunyikan saja.
        </p>
        <button className="btn" type="submit">Hapus kamar</button>
      </form>
    </>
  );
}
