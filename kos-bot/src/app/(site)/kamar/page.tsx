import { prisma } from "@/lib/prisma";
import { PageHead, NoData, RoomCard } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar" };

export default async function RoomsPage() {
  const [settings, rooms] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.room.findMany({
      where: { hidden: false },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { roomType: { include: { photos: { where: { isCover: true }, take: 1 } } } },
    }),
  ]);
  if (!settings) return <NoData />;

  return (
    <>
      <PageHead
        title="Kamar"
        sub={`Harga termasuk kuota listrik ${settings.electricQuota} kWh. ${settings.utilitiesNote}. Deposit ${settings.depositMonths}× sewa. Klik kamar untuk melihat foto dan detailnya.`}
      />
      {rooms.length ? (
        <div className="room-grid">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      ) : (
        <p className="muted">Belum ada kamar yang ditampilkan.</p>
      )}
    </>
  );
}
