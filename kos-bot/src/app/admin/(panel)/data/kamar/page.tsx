import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import Notice from "@/components/admin/Notice";
import RoomFields from "@/components/admin/RoomFields";
import { requireAdmin } from "@/lib/auth";

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const rooms = await prisma.room.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { roomType: { include: { _count: { select: { photos: true } } } } },
  });
  const types = await prisma.roomType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <section className="card" style={{ padding: 22, marginBottom: 18, overflowX: "auto" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Semua kamar</h2>
        <table>
          <thead><tr><th>Kamar</th><th>Harga</th><th>Status</th><th>Foto tipe</th><th></th></tr></thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.code}</strong><small>{r.roomType.name}{r.hidden ? " · disembunyikan" : ""}</small></td>
                <td>{rp(r.roomType.monthlyPrice)}</td>
                <td>{r.status.toLowerCase()}</td>
                <td>{r.roomType._count.photos}</td>
                <td><a href={`/admin/data/kamar/${r.id}`}>Ubah</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form method="post" action="/api/admin/data/rooms" className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tambah kamar</h2>
        <input type="hidden" name="op" value="create" />
        <RoomFields types={types} />
        <button className="btn btn-pri" type="submit" style={{ marginTop: 18 }}>Tambah kamar</button>
      </form>
    </>
  );
}
