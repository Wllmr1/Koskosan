import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { rp } from "@/lib/money";

export const dynamic = "force-dynamic";

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};
const FILTERS: [string, string, RoomStatus | null][] = [
  ["", "Semua", null],
  ["tersedia", "Tersedia", RoomStatus.AVAILABLE],
  ["terisi", "Terisi", RoomStatus.OCCUPIED],
  ["dibooking", "Dibooking", RoomStatus.BOOKED],
  ["perbaikan", "Perbaikan", RoomStatus.MAINTENANCE],
];
const ROOM_NOTICE: Record<string, { text: string; tone: "ok" | "bad" }> = {
  saved: { text: "Kamar disimpan. Situs dan asisten sudah memakai data baru.", tone: "ok" },
  invalid: { text: "Data kamar tidak valid, tidak ada yang diubah.", tone: "bad" },
  occupied: { text: "Kamar ini masih punya penghuni aktif, jadi tidak bisa dibuat tersedia.", tone: "bad" },
};

/** Rooms and availability: the data the site and the assistant read. */
export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ room?: string; status?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const rooms = await prisma.room.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { roomType: true } });
  const notice = q.room ? ROOM_NOTICE[q.room] : undefined;
  const filter = FILTERS.find(([k]) => k === (q.status ?? "")) ?? FILTERS[0];
  const shown = filter[2] ? rooms.filter((r) => r.status === filter[2]) : rooms;

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      <div className="chips">
        {FILTERS.map(([key, label, status]) => (
          <a key={key} className={filter[0] === key ? "chip on" : "chip"} href={key ? `/admin/kamar?status=${key}` : "/admin/kamar"}>
            {label} {status ? rooms.filter((r) => r.status === status).length : rooms.length}
          </a>
        ))}
      </div>
      {notice && <p className={notice.tone === "ok" ? "note" : "note bad"}>{notice.text}</p>}
      <div className="panel">
        <div className="h"><b>Kamar dan ketersediaan</b><span>Sumber data yang dibaca situs dan asisten. Kamar Tersedia langsung bisa ditawarkan asisten.</span></div>
        <div className="in">
          <table>
            <thead>
              <tr><th>Kamar</th><th>Status</th><th>Harga / bulan</th><th>Kosong mulai</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((room) => {
                const formId = `room-${room.id}`;
                return (
                  <tr key={room.id}>
                    <td>
                      {room.code}
                      <small>{room.roomType.name}</small>
                      <form id={formId} method="post" action="/api/admin/rooms">
                        <input type="hidden" name="roomId" value={room.id} />
                      </form>
                    </td>
                    <td>
                      <select form={formId} name="status" defaultValue={room.status} aria-label={`Status ${room.code}`}>
                        {Object.values(RoomStatus).map((s) => (
                          <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {rp(room.roomType.monthlyPrice)}
                      <small><a href={`/admin/data/tipe/${room.roomTypeId}`}>Ubah harga tipe</a></small>
                    </td>
                    <td>
                      <input
                        form={formId}
                        name="availableOn"
                        type="date"
                        defaultValue={room.availableOn ? room.availableOn.toISOString().slice(0, 10) : ""}
                        aria-label={`Kosong mulai ${room.code}`}
                      />
                    </td>
                    <td><button className="btn" type="submit" form={formId}>Simpan</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
