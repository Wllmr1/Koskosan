import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import RoomTypeFields from "@/components/admin/RoomTypeFields";
import PhotoManager from "@/components/admin/PhotoManager";
import { requireAdmin } from "@/lib/auth";

export default async function EditRoomTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const q = await searchParams;
  const type = await prisma.roomType.findUnique({
    where: { id },
    include: { photos: { orderBy: { sortOrder: "asc" } }, rooms: { orderBy: { code: "asc" }, select: { id: true, code: true } } },
  });
  if (!type) notFound();

  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <form method="post" action="/api/admin/data/room-types" className="card" style={{ padding: 22, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tipe {type.name}</h2>
        <input type="hidden" name="op" value="save" />
        <input type="hidden" name="id" value={type.id} />
        <RoomTypeFields type={type} />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-pri" type="submit">Simpan</button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Kamar di tipe ini:{" "}
          {type.rooms.length ? type.rooms.map((r) => <a key={r.id} href={`/admin/data/kamar/${r.id}`} style={{ marginRight: 8 }}>{r.code}</a>) : "belum ada"}
        </p>
      </form>
      <PhotoManager photos={type.photos} roomTypeId={type.id} back={`/admin/data/tipe/${type.id}`} />
      <form method="post" action="/api/admin/data/room-types" className="card" style={{ padding: 22 }}>
        <input type="hidden" name="op" value="delete" />
        <input type="hidden" name="id" value={type.id} />
        <p className="muted small" style={{ marginTop: 0 }}>Tipe yang masih punya kamar tidak bisa dihapus.</p>
        <button className="btn" type="submit">Hapus tipe</button>
      </form>
    </>
  );
}
