import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import { tagsOf } from "@/lib/room-types";
import Notice from "@/components/admin/Notice";
import RoomTypeFields from "@/components/admin/RoomTypeFields";
import { requireAdmin } from "@/lib/auth";

export default async function RoomTypesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const types = await prisma.roomType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { rooms: true, photos: true } } },
  });
  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <section className="card" style={{ padding: 22, marginBottom: 18, overflowX: "auto" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tipe kamar</h2>
        <table>
          <thead><tr><th>Tipe</th><th>Harga</th><th>Kamar</th><th>Foto</th><th></th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong><small>{tagsOf(t).join(" · ")}</small></td>
                <td>{rp(t.monthlyPrice)}</td>
                <td>{t._count.rooms}</td>
                <td>{t._count.photos}</td>
                <td><a href={`/admin/data/tipe/${t.id}`}>Ubah</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form method="post" action="/api/admin/data/room-types" className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tambah tipe</h2>
        <input type="hidden" name="op" value="save" />
        <RoomTypeFields />
        <button className="btn btn-pri" type="submit" style={{ marginTop: 18 }}>Tambah tipe</button>
      </form>
    </>
  );
}
